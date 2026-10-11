// Linh vật: chú mèo vàng (tên mặc định "Mít"). Vẽ bằng SVG, đổi biểu cảm theo mood.
// mood: idle | happy | think | sad | sleep | wow

const INK = '#3B2F4A';

function eyes(mood) {
  switch (mood) {
    case 'happy':
      return `<path d="M37 61 q7 -9 14 0 M69 61 q7 -9 14 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    case 'sleep':
      return `<path d="M37 61 q7 5 14 0 M69 61 q7 5 14 0" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
        <text x="94" y="30" font-size="16" font-weight="800" fill="${INK}" font-family="sans-serif">z</text>
        <text x="104" y="18" font-size="12" font-weight="800" fill="${INK}" font-family="sans-serif">z</text>`;
    case 'sad':
      return `<path d="M35 53 l13 -5 M85 53 l-13 -5" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
        <ellipse cx="44" cy="62" rx="4.5" ry="5.5" fill="${INK}"/><ellipse cx="76" cy="62" rx="4.5" ry="5.5" fill="${INK}"/>`;
    case 'think':
      return `<ellipse cx="47" cy="57" rx="5" ry="7" fill="${INK}"/><ellipse cx="79" cy="57" rx="5" ry="7" fill="${INK}"/>
        <circle cx="49" cy="54" r="1.8" fill="#fff"/><circle cx="81" cy="54" r="1.8" fill="#fff"/>`;
    case 'wow':
      return `<circle cx="44" cy="60" r="8" fill="${INK}"/><circle cx="76" cy="60" r="8" fill="${INK}"/>
        <circle cx="47" cy="57" r="3" fill="#fff"/><circle cx="79" cy="57" r="3" fill="#fff"/>`;
    default:
      return `<ellipse cx="44" cy="60" rx="5" ry="7" fill="${INK}"/><ellipse cx="76" cy="60" rx="5" ry="7" fill="${INK}"/>
        <circle cx="46" cy="57" r="1.8" fill="#fff"/><circle cx="78" cy="57" r="1.8" fill="#fff"/>`;
  }
}

function mouth(mood) {
  switch (mood) {
    case 'happy':
      return `<path d="M50 77 q10 13 20 0 z" fill="#7A2E3A" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    case 'sad':
      return `<path d="M52 83 q8 -7 16 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    case 'wow':
      return `<ellipse cx="60" cy="81" rx="5" ry="6" fill="#7A2E3A" stroke="${INK}" stroke-width="2.5"/>`;
    case 'think':
      return `<path d="M56 80 q6 -3 10 1" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    default:
      return `<path d="M51 76 q4.5 5 9 0 q4.5 5 9 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  }
}

export function mascotSVG(mood = 'idle') {
  return `<svg viewBox="0 0 120 112" role="img" aria-label="Linh vật" class="mascot-svg">
    <path d="M20 46 L28 8 L54 28 Z" fill="#FFC94D" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M100 46 L92 8 L66 28 Z" fill="#FFC94D" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M28 36 L31 18 L44 29 Z M92 36 L89 18 L76 29 Z" fill="#FF9AA2"/>
    <ellipse cx="60" cy="64" rx="46" ry="40" fill="#FFC94D" stroke="${INK}" stroke-width="3.5"/>
    <path d="M50 30 q2 8 0 12 M60 27 q2 9 0 14 M70 30 q2 8 0 12" fill="none" stroke="#E8A93A" stroke-width="4" stroke-linecap="round"/>
    <circle cx="32" cy="76" r="7" fill="#FF9AA2" opacity=".75"/><circle cx="88" cy="76" r="7" fill="#FF9AA2" opacity=".75"/>
    ${eyes(mood)}
    <path d="M56.5 70 h7 l-3.5 4 z" fill="#FF7A8A" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    ${mouth(mood)}
    <path d="M14 70 l14 2 M14 80 l14 -2 M106 70 l-14 2 M106 80 l-14 -2" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
  </svg>`;
}

// Câu Mít nói, giọng teen nhẹ nhàng.
export const LINES = {
  greet: ['Hôm nay mình học vài từ nha?', 'Mỗi ngày một chút là giỏi lên thôi!', 'Sẵn sàng phá đảo chưa?', 'Nay học chủ đề nào đây ta?'],
  correct: ['Chuẩn luôn!', 'Đỉnh quá!', 'Xịn xò!', 'Đúng rồi nè!', 'Quá đã!'],
  wrong: ['Suýt nữa thôi!', 'Thử lại chút nha', 'Gần đúng rồi đó!', 'Bình tĩnh, nhìn kỹ gợi ý nè'],
  doneGreat: ['Xịn quá! Giữ phong độ nha!', 'Phá đảo luôn rồi!', 'Hôm nay cháy quá!'],
  doneOk: ['Ổn áp rồi đó!', 'Tiến bộ từng chút một nha!', 'Ôn thêm mấy từ kia là chuẩn!'],
  doneLow: ['Không sao, từ khó thì ôn lại thôi!', 'Lần sau sẽ tốt hơn, Mít tin bạn!'],
  sleepy: ['Lâu rồi không gặp, Mít buồn ngủ luôn á…'],
};

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
