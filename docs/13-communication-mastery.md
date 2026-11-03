# 13. Communication Mastery System

| | |
|---|---|
| **Status** | Implemented (schema, rules, REST API, UI with in-browser recording, tests) |
| **Code** | `src/lib/domain/communication.ts` · `src/db/schema/communication.ts` · `drizzle/0011_communication.sql`, `0012_communication_rules.sql` · `src/features/communication/` · `src/lib/storage/` · `/communication`, `/communication/:skill`, `/communication/assess` |

## 1. Skills

The 14 skills are seeded on first visit, and each one is editable:

1. Spoken English
2. Vocabulary
3. Grammar
4. Pronunciation
5. Articulation
6. Active listening
7. Questioning techniques
8. Storytelling
9. Public speaking
10. Presentation
11. Emotional intelligence
12. Assertiveness
13. Negotiation
14. Conflict resolution

| Each skill has | Where |
|---|---|
| Current proficiency (1–10) | **The latest assessment only** (`comm_assessments`) |
| Target proficiency | `comm_skills.target_level` |
| Practice exercises | `comm_exercises` (daily or skill-specific; add your own) |
| Learning resources | `comm_resources` (book, course, video, podcast, article, app) |
| Practice history | `comm_practice_sessions`: date, minutes, how it went (1–5, not a proficiency rating), written output, vocabulary words, recording |
| Evidence of improvement | Every assessment requires written evidence and can attach a recording. The level-over-time chart compares each assessment with the first. |
| Monthly assessment | `/communication/assess`: one row per skill, "assessed this month" status |

## 2. Assessment, not activity

Exercises never declare proficiency.

- Logging practice adds to the history and leaves the level untouched.
- The level changes only when you record a **dated assessment** with **evidence**. The method can be self-assessment, recording review, peer feedback, mentor or coach, or a formal test.
- A skill with no assessment in 30 days is marked **assessment due**. If it has practice since its last assessment (or was never assessed), it shows "practised but never assessed" or "assessment due".
- Assessments and practice can't be dated in the future.

## 3. Daily exercises

| Exercise | Trains | Captures |
|---|---|---|
| Record a two-minute speech | Public speaking | Audio recording |
| Explain one complex topic simply | Articulation | Written explanation |
| Practise five new vocabulary words | Vocabulary | The five words |
| Listen to a conversation and summarise it | Active listening | Written summary |
| Practise handling an objection | Negotiation | Audio recording or written response |

## 4. Audio recordings

**Recording.**
- Record in the browser (MediaRecorder: webm/opus, or mp4 on Safari), or upload an audio file.
- The recording is uploaded to `POST /api/v1/communication/recordings` (≤ 4 MB, audio types only) and attached to a practice session or an assessment.

**Storage** (`src/lib/storage`):
- `STORAGE_DRIVER=local` keeps files under `.data/uploads` for development. It is refused in production.
- `STORAGE_DRIVER=s3` uses any S3-compatible bucket (Cloudflare R2 recommended), configured with the `STORAGE_S3_*` variables in `.env.example`.

**Access control:**
- Keys are `{userId}/recordings/{uuid}.{ext}`, enforced by a check constraint and key validation.
- The bucket stays private. Audio is streamed only through `GET /api/v1/communication/recordings/:id`, after the RLS-protected lookup, with HTTP Range support for seeking.
- A recording attached to practice or an assessment can't be deleted.

## 5. REST API (`/api/v1/communication`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/communication?day=` | Skills with assessment-based levels, daily exercises with today's status, monthly progress |
| GET / PATCH | `/communication/skills/:key` | Skill detail / `{ targetLevel?, description? }` |
| POST | `/communication/exercises` | `{ skillId, title, instructions?, durationMinutes?, isDaily? }` |
| POST / DELETE | `/communication/resources`, `/communication/resources/:id` | Resources |
| GET / POST / DELETE | `/communication/practice`, `/communication/practice/:id` | Practice sessions `{ exerciseId? \| skillId?, practicedOn?, durationMinutes?, selfRating?, content?, words?, notes?, recordingId? }` |
| POST | `/communication/assessments` | `{ skillId, level, method, evidence, assessor?, recordingId?, assessedOn?, notes? }` |
| POST | `/communication/recordings` | multipart `file` (+ `durationSeconds`) |
| GET / DELETE | `/communication/recordings/:id` | Stream (Range supported) / delete if unattached |

## 6. Tests

- **`src/lib/domain/communication.test.ts` (4 tests):**
  - the catalogue (14 skills, 5 daily exercises tied to real skills);
  - 40 practice sessions leaving the level at "not assessed";
  - the level, change and gap taken from assessments;
  - the 30-day due rule;
  - local storage put/get/delete, and path-traversal keys refused.
- **`tests/integration/communication.test.ts` (3 tests):**
  - seeding and daily completion;
  - level changes only through evidence-backed assessments (12 sessions, then mentor-rated 6 after self-rated 4);
  - future assessments rejected;
  - a recording stored under the owner's prefix, attached to practice, undeletable while attached, rejected for non-audio, and invisible to another user.
- **Browser check:**
  - fake microphone → record → attach → log;
  - stream and range requests; anonymous access gets `401`;
  - assessment raises the level;
  - monthly assessment; no overflow on a phone.
