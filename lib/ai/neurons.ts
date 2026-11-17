// 서버·클라이언트 공용 순수 함수.
// ⚠️ 7-12: 스텝 요금은 이미지 1장이 아니라 "타일마다" 붙는다.
//   틀림: 4×4.8 + 6×9.6 = 76.8   맞음: 4×(4.8 + 6×9.6) = 249.6  (실측 7,738 ÷ 31장 = 249.6)
// 반환값은 실수다. 화면에 표시할 때만 Math.round().
export function neuronsPerImage(steps: number, size = 1024): number {
  const tiles = Math.max(1, Math.round((size / 512) * (size / 512)));
  return tiles * (4.8 + Math.min(Math.max(steps, 1), 8) * 9.6);
}
export const FREE_NEURONS_PER_DAY = 10000;
export function imagesPerDay(steps: number, budget = FREE_NEURONS_PER_DAY) {
  return Math.floor(budget / neuronsPerImage(steps));
}
