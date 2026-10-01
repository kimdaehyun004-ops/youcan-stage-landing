# 03. 작업 절차 — 요청 전 2중 검토 (G0~G7)

> 크레딧을 쓰는 요청은 G0부터 G7까지 **순서대로만** 진행합니다. 건너뛰면 Hook이 막습니다.
> 명령은 모두 저장소 루트에서 실행합니다:
> `python3 production/guro-paper-plane/harness/hfgate.py <cmd>`

## G0. 세션 시작 점검
- [ ] Hook 설치
  ```
  mkdir -p .claude && cp production/guro-paper-plane/harness/claude-settings.json .claude/settings.json
  ```
- [ ] 셀프테스트
  1. `touch production/guro-paper-plane/harness/.selftest`를 실행합니다.
  2. Higgsfield `balance`를 호출합니다. "HFGATE SELFTEST OK"로 거부되면 정상입니다.
  3. `.selftest`를 삭제합니다.
- [ ] 실제 잔액을 조회하고 `hfgate.py balance <잔액>`으로 기록합니다.
- [ ] `hfgate.py status`로 SEQ별 상태와 남은 계획 비용을 확인합니다.

## G1. 요청 정리 (사용자 말 → 변경 범위)
- [ ] 사용자의 말을 **그대로** `change_request.user_said`에 적습니다.
- [ ] 바꿀 항목만 `allowed_changes`에 적습니다(예: `beats[0]`, `audio`).
- [ ] 이 SEQ에 필요한 연출 결정이 06-확정결정에 모두 있는지 확인합니다. 없으면 **먼저 사용자에게 묻습니다**(E1 재발 방지).

## G2. 영향 분석 (먼저 보고)
- [ ] 이 SEQ를 바꾸면 stale이 되는 뒤 SEQ와 그 재생성 비용을 계산합니다.
  - 예: "SEQ1만 다시 만들면 168cr + SEQ2·3 재생성 240cr = 408cr"
- [ ] 잔액과 예비분(20cr)을 기준으로 재시도 여유가 있는지 05-크레딧계획에 반영합니다.

## G3. 설계서 작성 → 자동 검사
- [ ] 이전 버전을 복사해 `specs/<SEQ>.v<n>.json`을 만듭니다. `supersedes`에 이전 버전을 적습니다.
- [ ] `hfgate.py lint <spec>`의 결과가 **PASS**여야 합니다. 경고도 하나씩 판단해 기록합니다.
  - 자동 검사 목록: L1 고정 문구, L2 보이는 장소의 레퍼런스, L3 end_image 금지, L4 앞 SEQ 확정 여부, L5 금지어, L6 타임라인, L7 출력 규격, L8 시작/끝 상태 일치, L9 변경 범위, L10 길이, L11 미디어 ID, L12 예산, L13 컷 위험 카메라 지시

## G4. 사람 2차 검토 (lint가 못 보는 것)
`hfgate.py build <spec>`의 출력을 **처음부터 끝까지 읽고** 확인합니다.
- [ ] 시작 상태가 앞 SEQ의 **실제 마지막 프레임**과 맞는가 (가능하면 프레임을 보고 확인)
- [ ] 좌우 방향(창문 쪽, 문 쪽, 운동장 쪽)이 장소 레퍼런스와 맞는가
- [ ] 각 구간에서 카메라 이동이 한 방향의 연속된 움직임인가 (2초 안에 큰 회전이 없는가)
- [ ] 비행기는 항상 기수 방향으로 날고, 카메라는 뒤나 옆에서 따라가는가
- [ ] 이전 버전과 바뀐 문장이 `allowed_changes`와 정확히 일치하는가 (lint의 diff 줄)
- [ ] 첨부 미디어의 역할이 맞는가 (video_references는 확정된 앞 SEQ 작업 ID, image_references는 비행기와 보이는 장소)
- [ ] 이 요청이 실패하면 무엇을 바꿀지 미리 정했는가 (실패한 프롬프트를 그대로 다시 보내지 않음)

## G5. 승인 → 사용자 확인 → 요청
1. `hfgate.py approve <spec>`을 실행합니다. 해시가 기록되고 `build/<spec>.tool_input.json`이 생성됩니다.
2. 사용자에게 다음을 보고합니다.
   - 비용과 요청 후 잔액
   - 바뀌는 점과 바뀌지 않는 점
   - 남는 위험
3. **사용자가 OK하면** `hfgate.py confirm <spec> --quote "<사용자 말>"`을 실행합니다.
4. `tool_input.json` 내용을 **한 글자도 바꾸지 않고** generate_video로 보냅니다. Hook이 해시를 대조하고, 승인은 1회만 쓸 수 있습니다.

## G6. 생성 직후 QA (자동) + 사용자 확인
- [ ] `hfgate.py qa-cmd <spec> <결과 URL> --upstream-url <앞 SEQ URL>`의 출력을 Higgsfield `sandbox_exec`로 실행합니다.
  - 판정 기준
    - 컷: 장면 전환 점수 0.25 초과가 0개
    - 이음매: lumaCorr ≥0.45, MAD ≤32
    - 길이와 해상도 확인
- [ ] QA 결과와 영상 링크를 사용자에게 보냅니다. 수치로 잡을 수 없는 문제가 있으니 반드시 화면으로 확인을 받습니다(R20).

## G7. 확정 또는 반려
- 사용자가 OK하면 `hfgate.py accept <SEQ> <job> --quote "<사용자 말>"`을 실행합니다. 뒤 SEQ는 자동으로 stale이 됩니다.
- 사용자가 NG하면 `hfgate.py reject <SEQ> <job> --reason "..."`을 실행하고, 01-오류기록에 원인을 추가한 뒤 G1부터 다시 시작합니다.
- 진행 상태를 07-현황판에 반영합니다.

---

### 크레딧을 쓰지 않는 작업 (Hook 대상 아님)
- jobs_wait, sandbox_exec(QA·변환·조립), media_upload / media_confirm, get_cost 조회
