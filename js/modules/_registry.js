// Danh sách các phần học theo lộ trình và môn: MODULES[lộ trình][môn]. Thêm module mới: thêm một dòng ở đây + thư mục js/modules/<id>/.

const VOCAB = { id: 'vocab-scramble', emoji: '🔤', title: 'Từ vựng: Xếp chữ', desc: 'Xếp chữ cái thành từ theo gợi ý', route: '#/topics', enabled: true };

export const MODULES = {
  thpt: {
  // Bám các dạng bài trong đề tốt nghiệp THPT (cấu trúc từ 2025).
  anh: [
    VOCAB,
    { id: 'cloze', emoji: '📝', title: 'Điền từ vào thông báo, quảng cáo', desc: 'Từ loại, giới từ, cụm từ cố định (câu 1–12 trong đề)', route: '#/ex?m=cloze', enabled: true },
    { id: 'arrange', emoji: '🔀', title: 'Sắp xếp câu', desc: 'Hội thoại, lá thư, đoạn văn (câu 13–17 trong đề)', route: '#/ex?m=arrange', enabled: true },
    { id: 'gap-sentence', emoji: '🧩', title: 'Điền câu vào đoạn', desc: 'Chọn câu/cụm còn thiếu (câu 18–22 trong đề)', route: '#/ex?m=gap-sentence', enabled: true },
    { id: 'reading', emoji: '📖', title: 'Đọc hiểu', desc: 'Ý chính, chi tiết, từ vựng, quy chiếu, suy luận (câu 23–40 trong đề)', route: '#/ex?m=reading', enabled: true },
    { id: 'mock-test', emoji: '🏁', title: 'Đề thi thử', desc: '40 câu, 50 phút, đúng cấu trúc đề tốt nghiệp từ 2025', route: '#/ex?m=mock-test', mock: true, enabled: true },
  ],
  // Vật lý (môn còn khoá "Sắp có"; dữ liệu trong data/thpt/vat-ly/). Bám đề tốt nghiệp từ 2025: 18 trắc nghiệm, 4 đúng/sai, 6 trả lời ngắn.
  vatly: [
    { id: 'vl-ly-thuyet', emoji: '📘', title: 'Lý thuyết nhanh', desc: 'Thẻ tóm tắt: khái niệm, công thức, lưu ý hay nhầm, câu hỏi nhanh', route: '#/ex?m=vl-ly-thuyet', enabled: true },
    { id: 'vl-chu-de', emoji: '🧪', title: 'Luyện theo chủ đề', desc: 'Trắc nghiệm, đúng/sai, trả lời ngắn; từ biết đến vận dụng', route: '#/ex?m=vl-chu-de', enabled: true },
    { id: 'vl-de-thi', emoji: '🏁', title: 'Đề thi thử', desc: '28 câu, 50 phút, chấm theo thang điểm của Bộ', route: '#/ex?m=vl-de-thi', mock: true, enabled: true },
  ],
  },
  tieuhoc: {
  // Bám bài đánh giá năng lực tiếng Anh vào lớp 6 các trường THCS chất lượng cao Hà Nội.
  anh: [
    { ...VOCAB, desc: 'Nhìn hình, đọc nghĩa, xếp chữ cho đúng chính tả' },
    { id: 'phonics', emoji: '👂', title: 'Ngữ âm', desc: 'Phát âm phần gạch chân và trọng âm', route: '#/ex?m=phonics', enabled: true },
    { id: 'grammar', emoji: '🧱', title: 'Ngữ pháp', desc: 'Các thì, so sánh, giới từ, giao tiếp, chia động từ', route: '#/ex?m=grammar', enabled: true },
    { id: 'reading', emoji: '📖', title: 'Đọc hiểu', desc: 'Thông báo, quảng cáo, tin nhắn, đoạn văn, điền từ', route: '#/ex?m=reading', enabled: true },
    { id: 'sentence', emoji: '✍️', title: 'Viết câu', desc: 'Sắp xếp câu, viết lại câu, tìm lỗi sai, viết đoạn văn', route: '#/ex?m=sentence', enabled: true },
    { id: 'mock-test', emoji: '🏁', title: 'Đề thi thử', desc: 'Khuôn Cầu Giấy, Nguyễn Tất Thành, Lômônôxốp: bấm giờ, chấm điểm', route: '#/ex?m=mock-test', mock: true, enabled: true },
  ],
  },
};

// Luôn trả mảng (rỗng nếu lộ trình/môn không có), để không chỗ nào nhận nhầm object.
export function modulesOf(track, subject = 'anh') {
  const list = MODULES[track]?.[subject];
  return Array.isArray(list) ? list : [];
}

export function findModule(track, id, subject = 'anh') {
  return modulesOf(track, subject).find((m) => m.id === id) || null;
}
