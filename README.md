# 네이버 블로그 자동 작성기

관심 키워드나 주제를 넣으면 AI가 글감을 찾고 → 글을 쓰고 → 사진을 구하거나 그리고 →
네이버 블로그 글쓰기 화면에 직접 입력해 발행까지 하는, **내 컴퓨터에서만 도는** 앱입니다.

## 처음 한 번 준비

1. **Node.js** (LTS) 와 **Claude Code**(`claude`)가 설치·로그인돼 있어야 합니다.
   ```bash
   node --version && claude --version
   ```
2. 이 폴더에서 필요한 프로그램 내려받기:
   ```bash
   npm install
   ```
3. 앱 켜기:
   ```bash
   npm run dev
   ```
   브라우저에서 http://localhost:4123 을 엽니다. 이 창은 켜둔 채로 두세요.
4. 화면의 **[네이버 로그인]** → 새 창에서 로그인. **"로그인 상태 유지"를 꼭 켜세요.**

### (선택) AI가 사진 그리기 — Cloudflare
```bash
cp env.sample .env.local      # 윈도우: copy env.sample .env.local
```
`.env.local` 을 열어 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` 을 채우고 앱을 껐다 켭니다.
사용량 실측을 보려면 토큰에 `Account Analytics: Read` 권한이 필요합니다(없으면 추정치 표시).
토큰 권한을 나중에 추가할 땐 **Edit** 를 쓰세요(Roll 은 키를 새로 만들어 기존 키가 무효가 됩니다).

## 준비된 글을 임시저장만 하기 (발행 안 함)
`post/` 폴더의 글(post.json + 사진)을 네이버 블로그에 **임시저장**만 합니다.
```bash
npm run save-draft
```
처음이면 네이버 로그인 창이 뜹니다. "로그인 상태 유지"를 켜고 로그인하세요.

## 매일 쓰기 한 줄 명령 (윈도우 PowerShell)
받은 `post-날짜-이름.zip` 을 내려받은 뒤, PowerShell 에 붙여넣으세요. 가장 최근 글 묶음을 앱 폴더에 풀고 바로 임시저장합니다(발행 안 함).
```bash
$z = Get-ChildItem "$HOME" -Recurse -Depth 4 -Filter "post-*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (-not $z) { "글 묶음(post-...zip)을 못 찾았어요" } else { $app = "$HOME\OneDrive\바탕 화면\naver-blog-auto"; $n = $z.BaseName -replace ' ?\(\d+\)$',''; Expand-Archive -Path $z.FullName -DestinationPath $app -Force; cd $app; "이번 글: $n"; npm.cmd run save-draft -- $n }
```

## 안전장치 (반드시 읽기)

- **자동 발행은 네이버 이용약관상 계정 제재 위험이 있습니다.**
- 기본값: **연습 모드 켜짐**(발행하지 않고 완성 화면만 저장), **공개 범위 비공개**, 하루 3편, 글 사이 30분.
  하루 수·간격은 네이버가 정한 값이 아니라 이 앱의 자체 브레이크입니다.
- 발행 직전 공개 범위가 실제로 선택됐는지 확인하고, 확인되지 않으면 **발행하지 않고 멈춥니다**
  (네이버 발행창의 기본값은 전체공개).
- **첫 실발행은 비공개 테스트 글로** 하세요.
- 검색으로 가져온 사진은 **저작권을 보장하지 않습니다.** 워터마크·국내 인물 얼굴은 자동으로 빼지만
  라이선스 확인은 직접 해야 합니다. AI 생성이 더 안전합니다.
- 브랜딩 모드는 사용자가 적은 실적 숫자만 씁니다(지어내지 않도록 지시).

## 검사 (계정 없이)
```bash
npm test
```

## 문제가 생기면
- 네이버 화면 구조가 바뀌면 `lib/scrape/selectors.ts` 한 파일만 고치면 됩니다.
  새로 잰 값은 후보 목록 **앞에 추가**하고 기존 값은 지우지 마세요.
- `npm run build` 후 `npm run dev` 가 500 을 내면 `.next` 폴더를 지우세요.
- 윈도우에서 `better-sqlite3` 설치가 실패하면 Node LTS 로 맞추거나 `npm rebuild better-sqlite3`.
- 윈도우 동작(폴더 선택창, claude 실행)은 **미검증**입니다.
