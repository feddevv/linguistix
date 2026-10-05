## MVP Core Features

1. **Authentication & Authorization**
   - Standard email/password registration and login.
   - OAuth integration (Google Sign-In).
   - Role-based access control (Teacher and Student roles).

2. **Rooms (Workspaces)**
   - Teachers can create rooms for 1-on-1 tutoring or mini-groups.
   - Room invites/joining mechanism for students.
   - Shared workspace dashboard for both teacher and student.

3. **Lesson Scheduling & Meeting Links**
   - Scheduling lessons with date, time, and external meeting links (Google Meet, Zoom).
   - Lesson statuses (Scheduled, Completed, Canceled).

4. **Calendar & Upcoming Lessons**
   - Agenda view / calendar view displaying upcoming sessions.
   - Separate schedule overview for both teacher and student.

5. **Homework Management (Assignment & Submission)**
   - Teacher can create and publish homework tasks (description, materials, links, deadlines).
   - Student can view pending assignments and submit answers (text response, file/link attachments).
   - Clear assignment statuses: Assigned, In Progress, Submitted, Completed.

6. **Homework Review & Feedback**
   - Teacher can review student submissions.
   - Ability to leave feedback/comments and mark assignments as reviewed or request revisions.

7. **Interactive Vocabulary / Personal Dictionary**
   - Room-based or student-based personal word list.
   - Saving words with translation, definition, and context sentence.
   - Basic word status tracking (e.g., Learning, Mastered) for future spaced repetition review.

## Dashboard & Core Screens (UI/UX Concept)

### 1. Teacher Dashboard (Command Center)

Focuses on operational management, student oversight, and quick actions:

- **Next Lesson Hero Card:**
  - Displays upcoming scheduled lesson details (room/student name, time countdown like "In 45 minutes", lesson topic).
  - Prominent "Join Call" button (direct redirect to Google Meet / Zoom).
- **Requires Attention Section:**
  - Actionable list of submitted assignments awaiting review (e.g., "Alex submitted Essay #2 — 2 hours ago").
  - One-click access directly to the submission review screen.
- **My Rooms Grid / List:**
  - Active room cards showing student/group name, avatar, latest homework status, and next scheduled session.
  - Prominent "+ Create Room" action button.
- **Schedule Overview (Agenda Widget):**
  - Compact chronological view of today's and upcoming classes to track workload.

---

### 2. Student Dashboard (Learning Hub)

Focuses on active learning, actionable tasks, and personal progress:

- **Next Lesson Hero Card:**
  - Mirrors the teacher's card: lesson date/time, teacher name, topic, and "Join Call" button.
  - Friendly empty state when no classes are scheduled for the day.
- **To-Do / Homework Section:**
  - Clear list of active assignments sorted by deadline.
  - Status badges: "Due Tomorrow", "Needs Revision", "Under Review", "Completed".
- **Daily Vocabulary / Practice Widget (Platform Differentiator):**
  - Quick-glance card: "12 words to review today".
  - "Practice Words" button linking directly to the flashcards / repetition mode.
- **Enrolled Rooms List:**
  - Quick navigation to rooms the student belongs to (e.g., 1-on-1 tutoring, group speaking club).

---

### 3. Room View (Shared Workspace)

The core collaborative hub for teacher and student, organized into 4 primary tabs:

1. **Overview / Feed:**
   - Pinned permanent meeting link for the room.
   - Activity stream: new assignments published, lessons scheduled, feedback received.
2. **Lessons & Schedule:**
   - Chronological log of past sessions (topics covered, lesson notes) and upcoming planned classes.
3. **Homework:**
   - Dedicated task manager with status filters: _Assigned_, _Submitted_, _Reviewed_.
4. **Vocabulary (Room Dictionary):**
   - Collaborative word bank tied specifically to this room.
   - Teachers can log new words during the lesson; students see updates and add them to their personal review deck.

---

### 4. Global Navigation (Sidebar)

Persistent primary navigation:

- **Dashboard** (role-specific home screen)
- **Rooms** (all accessible rooms / spaces)
- **Calendar** (agenda / monthly schedule)
- **Dictionary** (global vocabulary repository for students)
- **Bottom Utilities:** User profile, theme toggle (dark/light), Log Out
