// src/app/api/assessment/status/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session.user?.userId) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.userId;

        // *** FINAL FIX: Using correct column names from your schema ***
        const [rows] = await db.query(
            `SELECT 
                q.id, 
                q.name as title, 
                q.description,
                q.category,
                q.display_order,
                q.next_mystery_slug,
                COALESCE(a.status, 'pending') as status
             FROM questionnaires q
             LEFT JOIN (
                SELECT questionnaire_id, status, updated_at
                FROM assessments
                WHERE user_id = ?
             ) as a ON q.id = a.questionnaire_id
             WHERE q.has_narrator = 0
             ORDER BY q.display_order ASC, q.id ASC`,
            [userId]
        );

        const questionnaires = rows as any[];
        const mysterySlugs = Array.from(
            new Set(
                questionnaires
                    .map((item) => item.next_mystery_slug)
                    .filter((slug): slug is string => typeof slug === 'string' && slug.trim().length > 0)
            )
        );

        let mysteryDetailsMap = new Map<string, any>();
        let mysteryStatusMap = new Map<string, string>();

        if (mysterySlugs.length > 0) {
            const placeholders = mysterySlugs.map(() => '?').join(',');
            const [mysteryRows]: any = await db.query(
                `SELECT id, slug, name, short_description FROM mystery_assessments WHERE slug IN (${placeholders})`,
                mysterySlugs
            );
            mysteryDetailsMap = new Map(mysteryRows.map((row: any) => [row.slug, row]));

            const [sessionRows]: any = await db.query(
                `SELECT ma.slug, ms.status
                 FROM mystery_sessions ms
                 JOIN mystery_assessments ma ON ma.id = ms.mystery_assessment_id
                 WHERE ms.user_id = ?
                 ORDER BY ms.updated_at DESC`,
                [userId]
            );

            for (const row of sessionRows) {
                if (!mysteryStatusMap.has(row.slug)) {
                    mysteryStatusMap.set(row.slug, row.status);
                }
            }
        }

        const stages: any[] = [];

        questionnaires.forEach((questionnaire: any) => {
            const categoryName = questionnaire.category || 'سایر دسته‌بندی‌ها';
            const questionnaireStringId = `questionnaire:${questionnaire.id}`;
            stages.push({
                type: 'questionnaire',
                stringId: questionnaireStringId,
                questionnaireId: questionnaire.id,
                title: questionnaire.title,
                description: questionnaire.description,
                category: categoryName,
                display_order: questionnaire.display_order,
                rawStatus: questionnaire.status,
                next_mystery_slug: questionnaire.next_mystery_slug ?? null,
                accentColor: null,
            });

            if (questionnaire.next_mystery_slug) {
                const mystery = mysteryDetailsMap.get(questionnaire.next_mystery_slug);
                if (mystery) {
                    stages.push({
                        type: 'mystery',
                        stringId: `mystery:${questionnaire.next_mystery_slug}`,
                        mysterySlug: questionnaire.next_mystery_slug,
                        title: mystery.name,
                        description: mystery.short_description,
                        category: categoryName,
                        display_order: questionnaire.display_order + 0.01,
                        rawStatus: mysteryStatusMap.get(questionnaire.next_mystery_slug) || 'pending',
                        parentQuestionnaireId: questionnaire.id,
                        accentColor: '#F59E0B',
                    });
                }
            }
        });

        stages.sort((a, b) => {
            if (a.display_order !== b.display_order) return a.display_order - b.display_order;
            return a.stringId.localeCompare(b.stringId);
        });

        let currentAssigned = false;
        const processedStages = stages.map((stage, index) => {
            const previousStage = index > 0 ? stages[index - 1] : null;
            let finalStatus: 'completed' | 'current' | 'locked';
            const rawStatus = (stage.rawStatus || '').toLowerCase();

            if (stage.type === 'questionnaire') {
                if (rawStatus === 'completed') {
                    finalStatus = 'completed';
                } else if (rawStatus === 'in-progress') {
                    finalStatus = 'current';
                    currentAssigned = true;
                } else {
                    if (!currentAssigned) {
                        finalStatus = 'current';
                        currentAssigned = true;
                    } else {
                        finalStatus = 'locked';
                    }
                }
            } else {
                if (rawStatus === 'completed') {
                    finalStatus = 'completed';
                } else if (rawStatus === 'in-progress') {
                    finalStatus = 'current';
                    currentAssigned = true;
                } else {
                    const parentCompleted = previousStage ? (previousStage.finalStatus === 'completed') : true;
                    if (!currentAssigned && parentCompleted) {
                        finalStatus = 'current';
                        currentAssigned = true;
                    } else {
                        finalStatus = 'locked';
                    }
                }
            }

            const processed = {
                ...stage,
                finalStatus,
            };
            stages[index] = processed;
            return processed;
        });

        const responseData = processedStages.map((stage) => ({
            id: stage.type === 'questionnaire' ? stage.questionnaireId : stage.parentQuestionnaireId,
            stringId: stage.stringId,
            title: stage.title,
            description: stage.description,
            category: stage.category,
            status: stage.finalStatus,
            type: stage.type,
            questionnaireId: stage.type === 'questionnaire' ? stage.questionnaireId : stage.parentQuestionnaireId,
            mysterySlug: stage.type === 'mystery' ? stage.mysterySlug : null,
            display_order: stage.display_order,
            accentColor: stage.accentColor || null,
        }));

        return NextResponse.json({ success: true, data: responseData });

    } catch (error) {
        console.error("Get Assessment Status Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
