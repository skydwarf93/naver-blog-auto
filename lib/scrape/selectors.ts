// ★ 네이버 셀렉터 중앙 관리. 네이버 DOM 이 바뀌면 이 파일만 고친다.
// 7장의 값은 살아 있는 에디터에서 클릭까지 확인한 실측값이다. 정리·통합 대상이 아니다.
// 새로 측정한 값은 후보 배열의 "앞"에 추가하고, 기존 값은 지우지 말고 뒤에 남긴다(다른 계정/시점/A/B 대비).

export const NAVER = {
  loginUrl: "https://nid.naver.com/nidlogin.login",
  myBlog: "https://blog.naver.com/MyBlog.naver",
  writeUrl: (blogId: string) => `https://blog.naver.com/${blogId}?Redirect=Write&categoryNo=0`,
  newsSearch: (q: string) => `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(q)}&sort=1`,
  blogSearch: (q: string) => `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(q)}`,
  imageSearch: (q: string) => `https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(q)}`,
  googleImage: (q: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`,
  // 7-11: 게시글 주소로 바뀌어야 진짜 발행. 글쓰기 URL 이면 임시저장이다
  postUrlRe: /blog\.naver\.com\/[^/?#]+\/\d{6,}/,
  blogPostHrefRe: /blog\.naver\.com\/[^/]+\/\d{6,}/,
};

export const EDITOR = {
  frame: "iframe#mainFrame",

  restorePopup: [".se-popup-container", ".se-popup-dialog", ".se-popup", "[class*='popup_container']"],
  // ⚠️ 7-1: button:has-text('취소') 는 부분일치라 툴바의 '취소선' 버튼을 누른다 → 글 전체에 취소선.
  //    (틀린 추측: "물결표가 마크다운 취소선으로 변환됐다" — DB 초안엔 물결표가 0개였다.)
  //    클래스 기반을 먼저, 텍스트는 팝업 안으로 스코프 + :text-is 정확일치만.
  restoreCancel: [
    "button.se-popup-button-cancel",
    ".se-popup-button-cancel",
    ".se-popup-container button:text-is('취소')",
    ".se-popup-dialog button:text-is('취소')",
  ],
  title: [".se-section-documentTitle .se-text-paragraph", ".se-documentTitle .se-text-paragraph", ".se-title-text"],
  body: [".se-section-text .se-text-paragraph", ".se-component-content .se-text-paragraph", ".se-main-container"],
  imageButton: ["button.se-image-toolbar-button", "button[data-name='image']", "button[data-log='sti.image']", "button.se-toolbar-item-image"],
  helpPanel: [".se-help-container", ".se-help-panel"],
  helpClose: [".se-help-panel-close-button", ".se-help-header button"],
  // ⚠️ 7-3: 복원 팝업과 함께 깔리는 차단막. 남아 있으면 발행 클릭이 조용히 무시된다
  popupDim: [".se-popup-dim"],

  textFormatOpen: [".se-text-format-toolbar-button"],
  optHeading: [".se-toolbar-option-text-format-sectionTitle-button"],
  optBody: [".se-toolbar-option-text-format-text-button"],
  optQuote: [".se-toolbar-option-text-format-quotation-button"],
  dividerInsert: [".se-insert-horizontal-line-default-toolbar-button"],
  bold: [".se-bold-toolbar-button"],
  strike: [".se-strikethrough-toolbar-button"], // 활성 상태 확인용(누르지 않는다)
  bgColorOpen: [".se-background-color-toolbar-button"],
  bgColorYellow: ["button[title='#fff8b2']", ".se-color-palette[title='#fff8b2']"],
  bgColorNone: [".se-color-palette-no-color"],
  content: ".se-content",
  contentComponents: ".se-content .se-component",

  // ⚠️ 7-2: :has-text('발행') 은 '예약 발행 0건' 을 누른다 → 데이터 속성. 최종 확인 값의 `*` 는 오타가 아니다
  publishOpen: ["button[data-click-area='tpb.publish']", "button.publish_btn__m9KHH"],
  publishConfirm: ["button[data-click-area='tpb*i.publish']", "button.confirm_btn__WEaBq"],

  // 임시저장 — ⚠️ 미실측(로그인 전 작성). 실측값을 얻으면 앞에 추가할 것. 텍스트는 :text-is 정확일치만
  saveDraft: [
    "button[data-click-area='tpb.save']",
    "button[class*='save_btn']",
    "button:has(span:text-is('저장'))", // 실측: 버튼 글자가 "저장 0" 이라 :text-is('저장') 단독으로는 안 맞는다
    "header button:text-is('저장')",
    "button:text-is('저장')",
  ],

  // ⚠️ 7-19: radio input 은 opacity:0 → label 을 누르고 input.checked 로 확인. 네이버 기본값은 전체공개
  visibility: {
    public: { label: 'label[for="open_public"]', input: "#open_public" },
    neighbor: { label: 'label[for="open_neighbor"]', input: "#open_neighbor" },
    both: { label: 'label[for="open_both_neighbor"]', input: "#open_both_neighbor" },
    private: { label: 'label[for="open_private"]', input: "#open_private" },
  },
  // ⚠️ 7-18: 업로드 직후 0×0. 이미지 컴포넌트를 클릭하면 se-is-on 이 붙으며 펼쳐진다
  caption: ".se-caption",
  imageComponent: ".se-content .se-component.se-image",

  // ⚠️ 7-21: 우측 라이브러리 도크는 환경에 따라 se-help-* 계열이기도, se-sidebar-* 계열이기도 하다 → 둘 다 닫는다
  sidebarClose: [".se-help-panel-close-button", ".se-sidebar-close-button"],
  sidebar: [".se-sidebar", ".se-sidebar-container-library"],

  // 실측(2026-11, 윈도우): 마지막 블록 아래 빈칸의 정체. 좌표 클릭으로는 새 문단이 안 생겼다
  canvasBottom: [".se-canvas-bottom", ".se-is-clickable-canvas-bottom-button"],

  // ⚠️ 7-6: 하단 글감 검색바. 탈출 클릭이 여길 누르면 캡션이 검색창으로 샌다
  bottomToolbar: ".se-flayer-unified-toolbar-wrapper",
  bottomSearchInput: ".se-flayer-unified-search-input",
};

// 수집 노이즈 필터
// ⚠️ 6-4: href 에 '/news/' 조건이 help.naver.com/alias/news/... (고객센터)에도 걸린다 — 7-1 과 같은 부분일치 계열
export const SCRAPE = {
  excludeHref: [/help\.naver\.com/i, /\/alias\//i, /nid\.naver\.com/i, /\/search\.naver\?/i],
  noiseText: /광고|로그인|더보기|바로가기|언론사 선정|구독/,
  // 스크린리더용 보조 텍스트. 11자라 길이 필터를 통과하므로 "먼저" 제거한다
  srText: /새 ?창 ?열림/g,
};
