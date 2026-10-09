# GitHub OAuth 로그인

## 1. GitHub OAuth App 만들기

1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**
2. 입력값
   - Application name: 임의 (예: `todo-app`)
   - Homepage URL: `http://localhost:3000`
   - **Authorization callback URL: `http://localhost:3000/auth/github/callback`**
3. 생성 후 **Client ID**를 복사하고 **Generate a new client secret**으로 secret을 발급합니다.

## 2. 환경변수

`.env.example`을 `.env.local`로 복사하고 채웁니다. `.env.local`은 git에 올라가지 않습니다.

```
MONGODB_URI=mongodb://127.0.0.1:27017/todo
GITHUB_CLIENT_ID=<발급받은 Client ID>
GITHUB_CLIENT_SECRET=<발급받은 Client secret>
APP_URL=http://localhost:3000
```

- `APP_URL`은 앱이 실제로 접속되는 주소여야 하고, GitHub OAuth App의 callback URL과 같은 origin이어야 합니다. 개발 중에는 비워 두면 요청의 origin을 쓰지만, **production(`next start`)에서는 필수**입니다. 없으면 `/auth/github`가 500으로 거부합니다 (Host 헤더를 믿지 않기 위함).
- secret은 코드에 넣지 않고 환경변수로만 읽습니다. 설정이 없으면 `/auth/github`가 어떤 변수가 빠졌는지 알려 주는 500 응답을 돌려줍니다.
- `npm run dev:local`로 서버를 띄울 때도 같은 환경변수(`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_URL`)가 필요합니다. `.env.local`이 있으면 Next가 읽습니다.

## 3. 동작

| 경로 | 설명 |
|---|---|
| `GET /auth/github` | 랜덤 `state`를 httpOnly 쿠키에 저장하고 GitHub 인증 화면으로 이동 |
| `GET /auth/github/callback` | `state` 검증 → code를 access token으로 교환 → GitHub username, avatar_url을 DB에 저장(upsert) → 세션 발급 후 `/`로 이동 |
| `POST /auth/logout` | 서버의 세션 문서를 삭제하고 쿠키 제거 |
| `GET /api/me` | 로그인한 사용자 정보 (로그인 전 401) |

- 세션은 무작위 토큰을 httpOnly, SameSite=Lax 쿠키로 보내고, DB에는 토큰의 SHA-256 해시만 저장합니다. 유효기간은 7일이고 만료된 세션은 MongoDB TTL 인덱스가 지웁니다.
- `/api/todos`, `/api/weekly-plans`, `/api/goals`는 로그인 없이는 401입니다. 로그인한 사용자는 자기 데이터만 보고 수정하고 삭제할 수 있으며, 다른 사용자의 id는 404로 응답합니다.
- 할 일, 주간 계획, 1년 목표 문서에는 `userId`(MongoDB의 user_id 역할)가 필수로 들어갑니다. 주간 계획 겹침 검사와 연결 검사도 사용자별로 동작합니다.

## 4. 기존 데이터 이관

로그인 기능을 넣기 전에 만든 데이터에는 `userId`가 없어서 아무에게도 보이지 않습니다. 본인 GitHub 계정으로 **한 번 로그인한 뒤** 아래를 실행하면 소유자 없는 모든 할 일, 주간 계획, 1년 목표가 그 계정으로 이관됩니다.

```
MONGODB_URI=mongodb://127.0.0.1:27017/todo npm run migrate:owner -- <github-username>
```

- 여러 번 실행해도 안전합니다. 이미 소유자가 있는 문서는 바꾸지 않습니다.
- 해당 username이 아직 로그인한 적 없거나, 같은 username의 계정이 둘 이상이거나, 이관할 주간 계획이 이미 있는 계획과 기간이 겹치면 아무것도 바꾸지 않고 이유와 함께 종료합니다.
- 실행 시 Node가 `MODULE_TYPELESS_PACKAGE_JSON` 경고를 한 줄 출력하지만 동작에는 영향이 없습니다.
- `npm run dev:local`의 데이터는 `.data/mongo`에 있고 주소는 `mongodb://127.0.0.1:27018/todo`입니다.

## 5. 로컬에서 GitHub 로그인 건너뛰기 (개발 전용)

`npm run dev:local`은 `DEV_AUTH_BYPASS=1`로 서버를 띄웁니다. 이때 `http://localhost:3000`에 로그인 없이 접속하면 `/api/me`가 `dev-user`라는 로컬 사용자로 자동 로그인시키고 메인 화면을 보여 줍니다.

- 아래 조건을 **모두** 만족할 때만 동작합니다: `NODE_ENV`가 production이 아님, `DEV_AUTH_BYPASS=1`, 요청 주소가 `localhost`/`127.0.0.1`.
- Vercel 같은 프로덕션 배포에서는 환경변수가 있어도 동작하지 않습니다. 그래도 Vercel에는 이 변수를 넣지 마세요.
- 진짜 GitHub 로그인을 로컬에서 시험하려면 `DEV_AUTH_BYPASS=0 npm run dev:local`로 실행하세요.
- `dev-user`의 데이터는 실제 GitHub 사용자와 분리됩니다.

