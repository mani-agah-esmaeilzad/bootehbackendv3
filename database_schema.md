# اسکیما کامل دیتابیس پروژه `hrbooteh_db`

این فایل خلاصه‌ای از تمام جداول، ستون‌ها، محدودیت‌ها و داده‌های اولیه‌ای است که در اسکریپت `setup_local_db.sql` ساخته می‌شوند. در صورت نیاز به اعمال تغییر در ساختار دیتابیس، ابتدا این سند و سپس اسکریپت اصلی را به‌روزرسانی کنید.

## نمای کلی
- موتور: MySQL (InnoDB، `utf8mb4`).
- کاربران و نقش‌ها، پرسشنامه‌ها، نتایج ارزیابی، پیام‌های چت و وضعیت سشن‌ها در این دیتابیس نگه‌داری می‌شوند.
- تمام تاریخ‌ها از نوع `TIMESTAMP` و به صورت خودکار مقداردهی می‌شوند.
- پاک شدن کاربر یا ارزیابی، رکوردهای وابسته را با `ON DELETE CASCADE` حذف می‌کند.

## جداول و ستون‌ها

### 1. `users`
| ستون | نوع | توضیح |
| --- | --- | --- |
| `id` | `INT` کلید اصلی با Auto Increment |
| `username` | `VARCHAR(50)` یکتا و اجباری |
| `email` | `VARCHAR(100)` یکتا و اجباری |
| `password_hash` | `VARCHAR(255)` هش رمز عبور |
| `first_name` | `VARCHAR(50)` نام |
| `last_name` | `VARCHAR(50)` نام خانوادگی |
| `phone_number` | `VARCHAR(20)` اختیاری |
| `age` | `INT` اختیاری |
| `education_level` | `VARCHAR(100)` اختیاری |
| `work_experience` | `VARCHAR(100)` سابقه کاری |
| `gender` | `VARCHAR(20)` جنسیت |
| `role` | `ENUM('user','admin')` پیش‌فرض `user` |
| `is_active` | `BOOLEAN` فعال بودن حساب |
| `created_at` | `TIMESTAMP` زمان ایجاد |
| `updated_at` | `TIMESTAMP` زمان آخرین به‌روزرسانی |

### 2. `questionnaires`
| ستون | نوع | توضیح |
| --- | --- | --- |
| `id` | `INT` Auto Increment، کلید اصلی |
| `title` | `VARCHAR(255)` عنوان |
| `description` | `TEXT` توضیحات |
| `type` | `VARCHAR(50)` شناسه نوع پرسش‌نامه |
| `is_active` | `BOOLEAN` فعال/غیرفعال |
| `created_at`, `updated_at` | `TIMESTAMP`‌های سیستم |

### 3. `assessments`
| ستون | نوع | توضیح |
| --- | --- | --- |
| `id` | `INT` کلید اصلی |
| `user_id` | `INT` کلید خارجی به `users(id)` |
| `questionnaire_id` | `INT` کلید خارجی به `questionnaires(id)` |
| `score` | `INT` امتیاز کسب‌شده |
| `max_score` | `INT` حداکثر امتیاز |
| `level` | `VARCHAR(100)` سطح تفسیر |
| `description` | `TEXT` توضیح نتیجه |
| `completed_at` | `TIMESTAMP NULL` زمان اتمام |
| `created_at`, `updated_at` | `TIMESTAMP`‌های سیستم |

### 4. `chat_messages`
| ستون | نوع | توضیح |
| --- | --- | --- |
| `id` | `INT` کلید اصلی |
| `assessment_id` | `INT` کلید خارجی به `assessments(id)` |
| `user_id` | `INT` کلید خارجی به `users(id)` |
| `message_type` | `ENUM('user','ai','system','analysis')` نقش پیام |
| `content` | `TEXT` محتوای پیام |
| `character_name` | `VARCHAR(100)` نام کاراکتر گفتگو |
| `created_at` | `TIMESTAMP` زمان ارسال |

### 5. `assessment_states`
| ستون | نوع | توضیح |
| --- | --- | --- |
| `id` | `INT` کلید اصلی |
| `session_id` | `VARCHAR(255)` شناسه یکتای سشن |
| `state_data` | `JSON` وضعیت کامل ارزیابی |
| `created_at`, `updated_at` | `TIMESTAMP`‌های سیستم |

### 6. `soft_skills_self_assessment`
| ستون | نوع | توضیح |
| --- | --- | --- |
| `id` | `INT` کلید اصلی |
| `user_id` | `INT` کلید خارجی به `users(id)` |
| `q1` ... `q22` | `TINYINT` پاسخ ۲۲ سؤال (۱ تا ۵) |
| `created_at` | `TIMESTAMP` زمان ارسال پرسشنامه |

## محدودیت‌ها و ایندکس‌ها
- `users.username` و `users.email` یکتا هستند.
- `assessment_states.session_id` یکتا است.
- ایندکس‌های موجود:
  - `assessment_states`: ایندکس روی `session_id` و `created_at`.
  - `soft_skills_self_assessment`: ایندکس روی `user_id`.
  - `chat_messages`: ایندکس روی `assessment_id` و `user_id`.
  - `assessments`: ایندکس روی `user_id` (برای گرفتن لیست ارزیابی‌های هر کاربر).
- تمام روابط خارجی `ON DELETE CASCADE` دارند تا رکوردهای وابسته پس از حذف والد از بین بروند.

## داده‌های اولیه
- جدول `questionnaires`: دو رکورد «ارزیابی نیاز به استقلال» و «خودارزیابی مهارت‌های نرم» با شناسه‌های ۱ و ۲.
- جدول `users`: کاربر تست با نام کاربری `testuser` و نقش `user` (رمز عبور هش‌شده متناظر `test123`).

## نحوه استفاده
برای ساخت یا ریست دیتابیس در محیط محلی:
1. دیتابیس `hrbooteh_db` را بسازید (در صورت نیاز از `create_database_xampp.sql`).
2. اسکریپت `setup_local_db.sql` را اجرا کنید تا تمام جداول و داده‌های پیش‌فرض ایجاد شوند.
3. در صورت تغییر در ساختار، ابتدا این فایل را به‌روزرسانی کنید و سپس تغییرات را وارد اسکریپت SQL کنید.

## اسکریپت کامل SQL
```sql
-- Complete Database Setup for hrbooteh project
USE hrbooteh_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone_number VARCHAR(20),
    age INT DEFAULT NULL,
    education_level VARCHAR(100) DEFAULT NULL,
    work_experience VARCHAR(100) DEFAULT NULL,
    gender VARCHAR(20) DEFAULT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Questionnaires table
CREATE TABLE IF NOT EXISTS questionnaires (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Assessments table
CREATE TABLE IF NOT EXISTS assessments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    questionnaire_id INT NOT NULL,
    score INT DEFAULT 0,
    max_score INT DEFAULT 0,
    level VARCHAR(100),
    description TEXT,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE
);

-- Chat Messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assessment_id INT NOT NULL,
    user_id INT NOT NULL,
    message_type ENUM('user', 'ai', 'system', 'analysis') NOT NULL,
    content TEXT NOT NULL,
    character_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Assessment States table (for session management)
CREATE TABLE IF NOT EXISTS assessment_states (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    state_data JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Soft Skills Self Assessment table
CREATE TABLE IF NOT EXISTS soft_skills_self_assessment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    q1 TINYINT NOT NULL,
    q2 TINYINT NOT NULL,
    q3 TINYINT NOT NULL,
    q4 TINYINT NOT NULL,
    q5 TINYINT NOT NULL,
    q6 TINYINT NOT NULL,
    q7 TINYINT NOT NULL,
    q8 TINYINT NOT NULL,
    q9 TINYINT NOT NULL,
    q10 TINYINT NOT NULL,
    q11 TINYINT NOT NULL,
    q12 TINYINT NOT NULL,
    q13 TINYINT NOT NULL,
    q14 TINYINT NOT NULL,
    q15 TINYINT NOT NULL,
    q16 TINYINT NOT NULL,
    q17 TINYINT NOT NULL,
    q18 TINYINT NOT NULL,
    q19 TINYINT NOT NULL,
    q20 TINYINT NOT NULL,
    q21 TINYINT NOT NULL,
    q22 TINYINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add indexes for better performance
CREATE INDEX idx_session_id ON assessment_states(session_id);
CREATE INDEX idx_created_at ON assessment_states(created_at);
CREATE INDEX idx_user_id_soft_skills ON soft_skills_self_assessment(user_id);
CREATE INDEX idx_assessment_messages ON chat_messages(assessment_id);
CREATE INDEX idx_user_messages ON chat_messages(user_id);
CREATE INDEX idx_user_assessments ON assessments(user_id);

INSERT IGNORE INTO questionnaires (id, title, description, type, is_active) VALUES
(1, 'ارزیابی نیاز به استقلال', 'گفتگوی تعاملی با آقای احمدی برای ارزیابی میزان نیاز به استقلال در محیط کار', 'independence', TRUE),
(2, 'خودارزیابی مهارت‌های نرم', 'پرسشنامه خودارزیابی 22 سوالی برای سنجش مهارت‌های نرم', 'soft_skills', TRUE);

INSERT IGNORE INTO users (username, email, password_hash, first_name, last_name, role) VALUES
('testuser', 'test@test.com', '$2b$10$rQJ9aDQGQdGmTwP7RQJ9cOd3ksHQJ9aDQGQdGmTwP7RQJ9cOd3ksH', 'کاربر', 'تست', 'user');

SELECT 'Database setup completed successfully!' as message;
```
