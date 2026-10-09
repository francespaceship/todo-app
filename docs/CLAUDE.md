# 프로젝트 가이드

할 일 관리 앱: 할 일 → 주간 계획 → 1년 목표를 연결하고, 칸반 드래그 앤 드롭으로 상태를 바꾸면 주간 진행률이 갱신된다. 요구사항은 `PRD.md`, 구현 계획은 `PLAN.md`.

## 스택
Next.js (App Router) + TypeScript + MongoDB(Mongoose), 드래그 앤 드롭은 `@dnd-kit/core`.

## 명령어
- `npm run dev` : 개발 서버 (`.env.local`에 `MONGODB_URI` 필요, 예시는 `.env.example`)
- `npm test` : 단위 + API 통합 테스트 (vitest, mongodb-memory-server라 로컬 MongoDB 불필요)
- `npm run build && npm run test:e2e` : Playwright E2E (인메모리 MongoDB와 빌드된 앱을 직접 띄움)
- `npx tsc --noEmit` : 타입 검사

## 구조
- `src/models/index.ts` Goal / WeeklyPlan / Todo 스키마
- `src/lib/week.ts` 주간 범위 계산, `src/lib/progress.ts` 진행률 계산
- `src/lib/plans.ts` 주간 계획·목표 조회 시 진행률 계산
- `src/app/api/**` Route Handlers, `src/components/**` 칸반 및 관리 UI

## 규칙
- 날짜는 `YYYY-MM-DD` 문자열로만 다룬다. `Date` 객체로 변환하지 않는다 (타임존 오류 방지).
- 진행률은 저장하지 않고 조회 시 계산한다. 별도 갱신 로직을 추가하지 않는다.
- 주간 계획/목표 삭제는 하위 항목을 지우지 않고 `updateMany`로 연결만 해제한다. Mongo 트랜잭션에 의존하지 않는다.
- 할 일을 주간 계획에 연결하라는 명시적 요청이 기간 밖이면 409. 날짜 수정으로 기간을 벗어나거나 주간 계획 기간 수정으로 밖이 되면 연결을 자동 해제하고 응답의 `notices`로 안내한다.
- 주간 계획은 월요일 시작, 서로 겹치지 않음. 1년 목표에는 시작일이 속한 연도의 목표만 연결 가능(연도가 바뀌면 자동 해제).
- 1년 목표 진행률은 할 일이 0개인 주간 계획을 평균에서 제외한다.
- PATCH는 링크나 날짜가 바뀔 때만 연결을 재검증한다 (드래그 상태 변경이 오래된 링크 때문에 실패하지 않도록).
- route.ts에서는 HTTP 메서드와 `dynamic` 외의 값을 export하지 않는다 (Next 빌드 제약). 공용 로직은 `src/lib`에 둔다.
- 인증: GitHub OAuth (`/auth/github`, `/auth/github/callback`, `POST /auth/logout`, `GET /api/me`). 세션 토큰은 해시만 DB(`sessions`)에 저장한다. 자세한 설정은 `AUTH.md`.
- 모든 데이터 API는 `requireUser`로 시작하고, 모든 조회·수정·삭제 쿼리에 `userId`를 넣는다. 남의 id는 404. 새 쿼리를 추가할 때 `userId` 누락은 곧 데이터 유출이다.
- secret은 환경변수로만 읽는다. `.env`는 커밋하지 않고, 값을 출력하거나 로그에 남기지 않는다.
