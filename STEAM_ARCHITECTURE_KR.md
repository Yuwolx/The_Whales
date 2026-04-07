# The Whales - Steam 아키텍처 설계서 (상태 기반 생태계 버전)

## 1. 문서 목적

본 문서는 The Whales를 Steam에서 장기 운영 가능한 제품으로 만들기 위한 구조를 정의한다.  
핵심 목표는 “AI가 결과물을 생산하는 시스템”이 아니라 “상태에 반응하며 살아있는 바다”를 구현하는 것이다.

---

## 2. 방향 전환 요약

기존:
- 고래 = AI agent
- 상호작용 = 결과 생성

변경:
- 고래 = 상태 기반 존재
- 상호작용 = 상태 표현

정의:
> 고래는 목적을 수행하기 위해 만나지 않는다.  
> 서로의 상태 변화에 반응하기 때문에 만나고 흩어진다.

---

## 3. 아키텍처 원칙

1. 목표/의도 중심 로직 제거  
2. 확률 기반 반응 시스템 채택  
3. 유저는 조종자가 아니라 관찰자  
4. 이벤트는 UI가 아니라 세계 변화로 전달  
5. 반복 가능한 최적 패턴보다 유기적 다양성을 우선

---

## 4. 시스템 구성

```text
[Presentation Layer]
  - 고정 관찰 뷰 카메라
  - 최소 HUD (브랜드/볼륨/팔로우 목록)
  - 직접 이벤트 알림 없는 미묘한 피드백

[Simulation Layer]
  - WhaleStateSystem
  - WhaleBehaviorSystem (확률 반응)
  - WhaleInteractionExpressionSystem
  - WorldTimeSystem (오프라인 경과 반영)

[Content Layer]
  - Whale Visual Profiles
  - Movement Parameter Profiles
  - Sound Cues / Ambient Presets

[Operations Layer]
  - Save/Load + Version Migration
  - Telemetry / Crash / Config
  - Steam Build & Release Pipeline
```

---

## 5. 핵심 도메인 모델

## 5.1 WhaleState
- `state`: calm | active | wandering | drifting | curious
- `energy`: 0..1
- `nearbyDensity`: 0..1
- `velocity`, `heading`, `wavePhase`

## 5.2 행동 선택(Action)
- `approach`
- `align`
- `circle`
- `drift_away`
- `ignore`

선택 방식:
- 고정 규칙 테이블 + 확률 가중치
- 동일 입력에서도 결과 다양성 보장

---

## 6. 프레임 업데이트 흐름

1. 주변 고래 탐지(거리/밀도 계산)  
2. 상태 전이 평가(state transition)  
3. 행동 후보 점수 계산  
4. 확률 샘플링으로 행동 결정  
5. 행동을 움직임/거리/사운드/시각 표현으로 변환  

---

## 7. 상호작용 정의 (표현 중심)

상호작용은 결과물이 아니라 다음의 변화로 나타난다.

- 동행 정렬 (heading 유사화)
- 미세 접근/이탈
- 맴돌기 궤적
- 짧은 저주파 사운드
- 매우 약한 광학적 반응

금지:
- “interaction started” 같은 UI 메시지
- 점수/보상형 표시
- 결과물 생산을 목적으로 한 구조

---

## 8. 카메라/유저 모델

유저 모델:
- 조종 없음
- 명령 없음
- 관찰/팔로우 중심

카메라 모드:
- 기본: 고정 관찰
- 선택: 특정 고래 팔로우
- 탭 이동: 시점 재배치

원칙:
- 시점은 안정적이어야 하며 과한 연출로 세계 감상을 방해하지 않음

---

## 9. 코드 리팩토링 지침

반드시 수행:
1. intent/goal/task 기반 코드 제거 또는 분리
2. 상태 기반 행동 시스템으로 재구성
3. 상호작용 로직을 표현 중심으로 변경
4. 결과물 생성 목적 코드 비활성화/재정의

권장 모듈:
- `WhaleStateSystem`
- `WhaleBehaviorPolicy`
- `WhaleMotionIntegrator`
- `WhaleExpressionSystem`
- `WorldPersistence`

---

## 10. 저장/운영 설계

저장 대상:
- 고래 상태(state, energy, phase, position)
- 세계 시계(sim clock)
- 유저 선호(볼륨, 팔로우)

운영 필수:
- save version + migration
- 성능 텔레메트리(FPS, update cost)
- 크래시 리포트 훅
- Steam 브랜치 운영(internal/beta/public)

---

## 11. 성능 목표

- 기본 타깃 60fps
- 저사양 fallback 30fps
- 상태 업데이트 O(N*k) 수준 유지 (k는 근접 후보 수 제한)

---

## 12. AI agent 전환 여지 (미래 확장)

현재 기준:
- 실시간 LLM 기반 고래 agent는 기본 런타임에 포함하지 않음

이유:
- 지연/비용/재현성/운영 복잡도

미래 확장 방향:
1. `BehaviorPolicy` 인터페이스를 상태 기반/AI 기반 모두 지원하게 설계  
2. 기본은 StatePolicy, 선택적으로 AIPolicy 바인딩  
3. AI는 “결과 생산”이 아니라 “상태 변화 편향”에만 관여  
4. 서버 추론 실패 시 StatePolicy로 즉시 fallback

즉:
- 지금은 상태 기반 생태계
- 나중에 AI agent를 덧씌울 수 있는 구조는 열어둔다

---

## 13. 최종 성공 기준

- 플레이어가 없어도 세계가 살아있는 느낌
- 고래들이 서로 의미 있는 존재처럼 보임
- 유저가 특정 고래에 애착을 느낌

---

## 14. 다음 단계

1. README/설계 문서 용어 통일 (`agent`, `생성`, `결과물` 중심 문구 제거)  
2. 런타임에서 상태 기반 행동 테이블 확정  
3. 시각/오디오 표현 강도 튜닝  
4. Steam 운영용 빌드/로그 파이프라인 연결

