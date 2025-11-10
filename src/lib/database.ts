// src/lib/database.ts
import mysql from 'mysql2/promise';
import { PERSONALITY_TEST_SEED } from '@/constants/personalityTestsSeed';

// پیکربندی دیتابیس از متغیرهای محیطی خوانده می‌شود
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  charset: 'utf8mb4'
};

// ایجاد pool connection برای مدیریت بهینه اتصالات
const pool = mysql.createPool(dbConfig);

// تابع برای دریافت اتصال با قابلیت تلاش مجدد در صورت بروز خطا
export async function getConnectionWithRetry(maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const connection = await pool.getConnection();
      return connection;
    } catch (error: any) {
      console.warn(`Connection attempt ${i + 1} failed:`, error.message);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Could not get a database connection after multiple retries.');
}

// تابع برای تست اولیه اتصال به دیتابیس
export async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('✅ اتصال به دیتابیس MySQL با موفقیت برقرار شد.');
    return true;
  } catch (error) {
    console.error('❌ خطا در اتصال به دیتابیس:', error);
    return false;
  } finally {
    if (connection) connection.release();
  }
}

// تابع اصلی برای ساختاردهی و ایجاد تمام جداول مورد نیاز پروژه
export async function createTables() {
  let connection;
  try {
    connection = await pool.getConnection();
    
    console.log("شروع فرآیند ایجاد جداول...");

    // جدول کاربران
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        phone_number VARCHAR(20),
        age INT,
        education_level VARCHAR(100),
        work_experience VARCHAR(100),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("  - جدول 'users' ایجاد شد.");

    // جدول ادمین‌ها
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log("  - جدول 'admins' ایجاد شد.");

    // جدول پرسشنامه‌ها (سناریوهای ارزیابی)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS questionnaires (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        initial_prompt TEXT NOT NULL,
        persona_prompt TEXT NOT NULL,
        analysis_prompt TEXT NOT NULL,
        has_narrator BOOLEAN DEFAULT FALSE,
        character_count INT DEFAULT 1,
        has_timer BOOLEAN DEFAULT TRUE,
        timer_duration INT DEFAULT 15,
        min_questions INT DEFAULT 5,
        max_questions INT DEFAULT 8,
        display_order INT DEFAULT 0,
        category VARCHAR(100) NOT NULL DEFAULT 'مهارت‌های ارتباطی',
        next_mystery_slug VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("  - جدول 'questionnaires' ایجاد شد.");

    await connection.execute(`
      ALTER TABLE questionnaires
      ADD COLUMN IF NOT EXISTS next_mystery_slug VARCHAR(255) DEFAULT NULL AFTER category
    `);

    await connection.execute(`
      ALTER TABLE questionnaires
      ADD COLUMN IF NOT EXISTS total_phases TINYINT DEFAULT 1 AFTER next_mystery_slug,
      ADD COLUMN IF NOT EXISTS phase_two_persona_name VARCHAR(255) DEFAULT NULL AFTER total_phases,
      ADD COLUMN IF NOT EXISTS phase_two_persona_prompt TEXT AFTER phase_two_persona_name,
      ADD COLUMN IF NOT EXISTS phase_two_analysis_prompt TEXT AFTER phase_two_persona_prompt,
      ADD COLUMN IF NOT EXISTS phase_two_welcome_message TEXT AFTER phase_two_analysis_prompt
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS personality_assessments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        tagline VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        report_name VARCHAR(255) NOT NULL,
        highlights TEXT NOT NULL,
        persona_name VARCHAR(255) DEFAULT 'کوچ شخصیت',
        initial_prompt TEXT,
        persona_prompt TEXT,
        analysis_prompt TEXT,
        has_timer BOOLEAN DEFAULT FALSE,
        timer_duration INT DEFAULT NULL,
        model VARCHAR(100) DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("  - جدول 'personality_assessments' ایجاد شد.");

    await connection.execute(`ALTER TABLE personality_assessments ADD COLUMN IF NOT EXISTS persona_name VARCHAR(255) DEFAULT 'کوچ شخصیت'`);
    await connection.execute(`ALTER TABLE personality_assessments ADD COLUMN IF NOT EXISTS initial_prompt TEXT`);
    await connection.execute(`ALTER TABLE personality_assessments ADD COLUMN IF NOT EXISTS persona_prompt TEXT`);
    await connection.execute(`ALTER TABLE personality_assessments ADD COLUMN IF NOT EXISTS analysis_prompt TEXT`);
    await connection.execute(`ALTER TABLE personality_assessments ADD COLUMN IF NOT EXISTS has_timer BOOLEAN DEFAULT FALSE`);
    await connection.execute(`ALTER TABLE personality_assessments ADD COLUMN IF NOT EXISTS timer_duration INT DEFAULT NULL`);
    await connection.execute(`ALTER TABLE personality_assessments ADD COLUMN IF NOT EXISTS model VARCHAR(100) DEFAULT NULL`);

    const [personalityCountRows]: any = await connection.execute("SELECT COUNT(*) as count FROM personality_assessments");
    if (personalityCountRows[0].count === 0) {
      const insertPlaceholders = PERSONALITY_TEST_SEED.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const insertValues: any[] = [];
      PERSONALITY_TEST_SEED.forEach((test) => {
        insertValues.push(
          test.name,
          test.slug,
          test.tagline,
          test.description,
          test.report_name,
          JSON.stringify(test.highlights),
          test.persona_name,
          test.initial_prompt,
          test.persona_prompt,
          test.analysis_prompt,
          test.has_timer ?? false,
          test.timer_duration ?? null,
          test.model ?? null,
          test.is_active ?? true
        );
      });
      if (insertPlaceholders.length > 0) {
        await connection.execute(
          `INSERT INTO personality_assessments (name, slug, tagline, description, report_name, highlights, persona_name, initial_prompt, persona_prompt, analysis_prompt, has_timer, timer_duration, model, is_active) VALUES ${insertPlaceholders}`,
          insertValues
        );
        console.log("  - داده‌های اولیه آزمون‌های شخصیتی اضافه شد.");
      }
    } else {
      for (const test of PERSONALITY_TEST_SEED) {
        await connection.execute(
          `UPDATE personality_assessments 
             SET tagline = ?, description = ?, report_name = ?, highlights = ?, persona_name = ?, initial_prompt = ?, persona_prompt = ?, analysis_prompt = ?, has_timer = ?, timer_duration = ?, model = ?, is_active = ? 
           WHERE slug = ?`,
          [
            test.tagline,
            test.description,
            test.report_name,
            JSON.stringify(test.highlights),
            test.persona_name,
            test.initial_prompt,
            test.persona_prompt,
            test.analysis_prompt,
            test.has_timer ?? false,
            test.timer_duration ?? null,
            test.model ?? null,
            test.is_active ?? true,
            test.slug,
          ]
        );
      }
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS personality_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        personality_assessment_id INT NOT NULL,
        session_uuid VARCHAR(64) NOT NULL UNIQUE,
        status ENUM('in-progress','completed','cancelled') DEFAULT 'in-progress',
        results JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (personality_assessment_id) REFERENCES personality_assessments(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'personality_sessions' ایجاد شد.");

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS personality_assessment_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        personality_assessment_id INT NOT NULL,
        slug VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        organization VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (personality_assessment_id) REFERENCES personality_assessments(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'personality_assessment_applications' ایجاد شد.");

    // جدول ارزیابی‌های هر کاربر
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS assessments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        questionnaire_id INT NOT NULL,
        session_id VARCHAR(255) UNIQUE,
        status ENUM('pending','in-progress','completed') DEFAULT 'pending',
        results JSON,
        current_phase TINYINT DEFAULT 1,
        phase_total TINYINT DEFAULT 1,
        score INT,
        max_score INT DEFAULT 100,
        description TEXT,
        supplementary_answers JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE,
        UNIQUE KEY uq_user_questionnaire (user_id, questionnaire_id)
      )
    `);
    console.log("  - جدول 'assessments' ایجاد شد.");

    await connection.execute(`
      ALTER TABLE assessments
      ADD COLUMN IF NOT EXISTS current_phase TINYINT DEFAULT 1 AFTER results,
      ADD COLUMN IF NOT EXISTS phase_total TINYINT DEFAULT 1 AFTER current_phase
    `);

    // جدول پیام‌های چت برای هر ارزیابی
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assessment_id INT NOT NULL,
        user_id INT NOT NULL,
        message_type ENUM('user', 'ai', 'system') NOT NULL,
        content TEXT NOT NULL,
        character_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'chat_messages' ایجاد شد.");

    // --- شروع جداول جدید برای پنل سازمانی ---

    // جدول سازمان‌ها
    // این جدول اطلاعات اصلی هر سازمان را ذخیره می‌کند
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS organizations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL, -- آدرس یونیک سازمان، مثلا 'my-company'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("  - جدول 'organizations' ایجاد شد.");

    // جدول اتصال سازمان به پرسشنامه (جدول واسط)
    // مشخص می‌کند که هر سازمان به کدام پرسشنامه‌ها دسترسی دارد
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS organization_questionnaires (
        organization_id INT NOT NULL,
        questionnaire_id INT NOT NULL,
        PRIMARY KEY (organization_id, questionnaire_id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'organization_questionnaires' ایجاد شد.");

    // جدول اتصال سازمان به کاربر (جدول واسط)
    // مشخص می‌کند که کدام کاربران عضو کدام سازمان هستند
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS organization_users (
        organization_id INT NOT NULL,
        user_id INT NOT NULL,
        PRIMARY KEY (organization_id, user_id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'organization_users' ایجاد شد.");

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        excerpt TEXT,
        content LONGTEXT NOT NULL,
        cover_image_url VARCHAR(500),
        author VARCHAR(100),
        is_published BOOLEAN DEFAULT TRUE,
        published_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("  - جدول 'blog_posts' ایجاد شد.");

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mystery_assessments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        short_description TEXT NOT NULL,
        intro_message TEXT NOT NULL,
        guide_name VARCHAR(255) DEFAULT 'رازمَستر',
        system_prompt TEXT NOT NULL,
        analysis_prompt TEXT,
        bubble_prompt TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("  - جدول 'mystery_assessments' ایجاد شد.");

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mystery_assessment_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mystery_assessment_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        ai_notes TEXT,
        display_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (mystery_assessment_id) REFERENCES mystery_assessments(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'mystery_assessment_images' ایجاد شد.");

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mystery_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        mystery_assessment_id INT NOT NULL,
        session_uuid VARCHAR(64) NOT NULL UNIQUE,
        status ENUM('in-progress','completed') DEFAULT 'in-progress',
        conversation JSON,
        summary JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (mystery_assessment_id) REFERENCES mystery_assessments(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'mystery_sessions' ایجاد شد.");

    await connection.execute(`
      ALTER TABLE mystery_assessments
      ADD COLUMN IF NOT EXISTS bubble_prompt TEXT AFTER analysis_prompt
    `);

    // --- پایان جداول جدید ---

    console.log('✅ فرآیند ایجاد جداول با موفقیت به پایان رسید.');
    return true;
  } catch (error) {
    console.error('❌ خطا در هنگام ایجاد جداول:', error);
    return false;
  } finally {
    if (connection) connection.release();
  }
}

export default pool;
