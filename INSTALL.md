# 설치 순서 (AI 에이전트용)

사용자가 이 저장소 주소를 주면서 "이 스킬을 설치해 줘"라고 했을 때 따르는 순서입니다.
사용자는 코딩을 모를 수 있습니다. 명령을 사용자에게 시키지 말고 직접 실행하고, 끝나면 무엇이 됐는지 쉬운 말로 알려 주세요.

## 1. 스킬 폴더 복사

저장소를 임시 폴더에 받아 `.claude/skills/namokposter` 폴더를 사용자의 스킬 폴더에 넣습니다.

| 운영체제 | 스킬이 놓일 자리 |
|---|---|
| macOS, Linux | `~/.claude/skills/namokposter` |
| Windows | `%USERPROFILE%\.claude\skills\namokposter` |

```bash
git clone --depth 1 https://github.com/hotjinnasim-code/NamokPoster.git "$TMPDIR/NamokPoster"
```

```bash
mkdir -p ~/.claude/skills && rm -rf ~/.claude/skills/namokposter && cp -R "$TMPDIR/NamokPoster/.claude/skills/namokposter" ~/.claude/skills/
```

- git이 없으면 `https://github.com/hotjinnasim-code/NamokPoster/archive/refs/heads/main.zip`을 받아 풉니다.
- 사용자가 버전을 정해 주면(예: 1.0.0) `git clone --depth 1 --branch v1.0.0 …`으로 그 버전을 받습니다. 말이 없으면 위 명령대로 최신을 받습니다.
- 이미 설치돼 있으면 새 폴더로 바꿔 최신으로 맞춥니다. 사용자가 그 폴더에 직접 넣은 파일이 있으면 지우기 전에 알립니다.
- 프로젝트 하나에서만 쓰겠다고 하면 그 프로젝트의 `.claude/skills/`에 넣습니다.

## 2. 필요한 프로그램

모든 포스터에 Node 18 이상과 Playwright의 Chromium이 필요합니다.

1. `node -v`로 Node를 확인합니다. 없거나 18보다 낮으면 설치합니다. macOS는 `brew install node`(Homebrew가 없으면 nodejs.org의 LTS 설치 파일), Windows는 `winget install OpenJS.NodeJS.LTS`.
2. 스킬 폴더 안에 Playwright를 넣고 Chromium을 받습니다. 스킬은 자기 폴더의 `node_modules`에서 Playwright를 찾으므로, 어느 폴더에서 포스터를 만들어도 동작합니다.

```bash
cd ~/.claude/skills/namokposter && npm install --no-save --no-package-lock playwright && npx playwright install chromium
```

## 3. 점검

```bash
node ~/.claude/skills/namokposter/scripts/doctor.mjs
```

마지막 줄이 `Ready: the default set …`이면 기본 세트(three.js와 HTML 스타일)를 만들 수 있습니다. Blender가 없다는 줄은 정상입니다. Blender는 사용자가 요청할 때만 씁니다.

## 4. 사용자에게 알릴 것

- 설치한 버전. 스킬 폴더의 `VERSION` 파일에 있고 `doctor.mjs`의 첫 줄에도 나옵니다.
- 설치가 끝났다는 것과, 이제 행사 내용을 말하면 A3 포스터 세 장을 완성본으로 만든다는 것. 예: "한여름 재즈 피크닉 포스터 만들어 줘. 8월 21일 토요일 오후 5시, 여울섬 잔디광장, 입장 무료야."
- 스킬이 바로 잡히지 않으면 새 대화를 열면 된다는 것.
- 포스터를 만들 때는 Opus 이상 모델을 권장한다는 것(주제 읽기, 제목의 뜻 단위 나누기, 스타일과 배치 고르기를 모델이 한다).
- 받은 임시 폴더는 지웁니다.

## Blender (사용자가 원할 때만)

사용자가 "블렌더 사용해서"라고 요청했거나 "블렌더도 쓸 수 있게 준비해 줘"라고 했을 때만 합니다. Blender 4.2 이상이 필요합니다.

- 앱으로 설치: macOS `brew install --cask blender`, Windows `winget install BlenderFoundation.Blender`. 또는 사용자가 https://www.blender.org/download/ 에서 받아 설치합니다(Mac은 응용 프로그램 폴더로 끌어 놓기). 표준 위치에 설치된 Blender는 스킬이 알아서 찾습니다.
- 앱을 설치할 수 없는 환경: `node ~/.claude/skills/namokposter/scripts/doctor.mjs --install-blender`가 Blender의 `bpy` 모듈을 전용 가상환경에 받습니다(약 350 MB, 관리자 권한이 필요 없습니다).
- 다시 `doctor.mjs`를 돌려 `Ready: all styles available.`이 나오는지 확인합니다.
