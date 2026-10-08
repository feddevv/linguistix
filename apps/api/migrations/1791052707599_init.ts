import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(
    `
      CREATE TYPE user_role AS ENUM ('student', 'teacher');

      CREATE TABLE IF NOT EXISTS "users" (
        id UUID PRIMARY KEY DEFAULT uuidv7(),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at DATE NOT NULL DEFAULT CURRENT_DATE,
        role user_role NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "rooms" (
        id UUID PRIMARY KEY DEFAULT uuidv7(),
        room_name VARCHAR(100) NOT NULL,
        meeting_url TEXT,
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at DATE NOT NULL DEFAULT CURRENT_DATE
      );

      CREATE TABLE IF NOT EXISTS "room_members" (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,

        UNIQUE(user_id, room_id)
      );

      CREATE TYPE lesson_status AS ENUM ('scheduled', 'completed', 'canceled', 'in_progress');

      CREATE TABLE IF NOT EXISTS "lessons" (
        id UUID PRIMARY KEY DEFAULT uuidv7(),
        meeting_url TEXT,
        teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
        room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        scheduled_at TIMESTAMPZ NOT NULL DEFAULT CURRENT_DATE,
        ends_at DATE NOT NULL,
        status lesson_status NOT NULL DEFAULT 'scheduled'
      );

      CREATE TYPE assignment_status AS ENUM ('draft', 'published', 'closed');

      CREATE TABLE IF NOT EXISTS "assignments" (
        id UUID PRIMARY KEY DEFAULT uuidv7(),
        title VARCHAR(255),
        content TEXT,
        teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
        room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        assigned_at DATE,
        due_to DATE,
        status assignment_status NOT NULL DEFAULT 'draft',
        max_grade SMALLINT,

        CONSTRAINT chk_published_field_not_null CHECK (
          status = 'draft' OR (
            title IS NOT NULL AND content IS NOT NULL AND due_to IS NOT NULL AND max_grade IS NOT NULL
            AND assigned_at IS NOT NULL
          )
        )
      );

      CREATE TYPE submission_status AS ENUM ('pending', 'submited', 'needs_revision', 'reviewed');

      CREATE TABLE IF NOT EXISTS "submissions" (
        id UUID PRIMARY KEY DEFAULT uuidv7(),
        content TEXT NOT NULL,
        student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        submitted_at DATE NOT NULL DEFAULT CURRENT_DATE,
        status submission_status NOT NULL DEFAULT 'pending',
        feedback TEXT,
        grade SMALLINT,
        reviewed_at TIMESTAMPZ,

        UNIQUE(student_id, assignment_id)
      );

      CREATE TABLE IF NOT EXISTS "words" (
        id UUID PRIMARY KEY DEFAULT uuidv7(),
        term VARCHAR(255) NOT NULL,
        meaning TEXT NOT NULL,
        room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
        content_sentence TEXT NOT NULL,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at DATE NOT NULL DEFAULT CURRENT_DATE
      );
    `,
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(
    `
      DROP TABLE IF EXISTS room_members;
      DROP TABLE IF EXISTS lessons;
      DROP TABLE IF EXISTS submissions;
      DROP TABLE IF EXISTS assignments;
      DROP TABLE IF EXISTS "words";
      DROP TABLE IF EXISTS rooms;
      DROP TABLE IF EXISTS users;

      DROP TYPE IF EXISTS user_role;
      DROP TYPE IF EXISTS lesson_status;
      DROP TYPE IF EXISTS assignment_status;
      DROP TYPE IF EXISTS submission_status;
    `,
  );
}
