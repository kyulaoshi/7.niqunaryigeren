// ======================================================================
//  Firebase 설정 파일  (선생님이 수정하는 유일한 코드 파일입니다)
// ======================================================================
//  1) Firebase 콘솔 → 프로젝트 설정 → "내 앱" → 웹 앱의 firebaseConfig 값을
//     아래 FIREBASE_CONFIG 안에 그대로 붙여 넣으세요.
//  2) ADMIN_EMAIL 에 Firebase Authentication 에 등록한 선생님 이메일을 적으세요.
//     (database.rules.json 안의 이메일과 반드시 같아야 합니다)
//
//  apiKey 가 비어 있으면 게임은 자동으로 "로컬 테스트 모드"로 실행됩니다.
//  (로컬 테스트 모드: 한 컴퓨터 안에서만 저장 · 여러 학생 실시간 공유 불가)
// ======================================================================

export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const ADMIN_EMAIL = "teacher@example.com";
