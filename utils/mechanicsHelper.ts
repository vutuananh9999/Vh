
/**
 * Ngoại lệ ném ra khi giá trị thuộc tính vượt quá ngưỡng tối đa cho phép.
 */
export class StatCapExceededException extends Error {
  public statName: string;
  public attemptedValue: number;
  public cap: number;

  constructor(statName: string, attemptedValue: number, cap: number) {
    const message = `LỖI HỆ THỐNG: Thuộc tính [${statName}] đạt giá trị ${attemptedValue}, vượt quá ngưỡng giới hạn (Cap) là ${cap}. Buff bị từ chối để tránh phản phệ.`;
    super(message);
    this.name = "StatCapExceededException";
    this.statName = statName;
    this.attemptedValue = attemptedValue;
    this.cap = cap;
  }
}

/**
 * Hàm applyBuff: Áp dụng tăng chỉ số kèm kiểm tra ngưỡng tối đa.
 * 
 * @param statName - Tên thuộc tính cần buff (để hiển thị trong lỗi)
 * @param current - Giá trị hiện tại của thuộc tính
 * @param buffAmount - Lượng giá trị muốn cộng thêm
 * @param maxCap - Ngưỡng tối đa không được vượt qua
 * @param strictMode - Nếu true: Ném ngoại lệ khi vượt cap. Nếu false: Cố định ở maxCap.
 * @returns Giá trị mới sau khi buff
 */
export const applyBuff = (
  statName: string,
  current: number,
  buffAmount: number,
  maxCap: number,
  strictMode: boolean = false
): number => {
  const newValue = current + buffAmount;

  if (newValue > maxCap) {
    if (strictMode) {
      // Trường hợp 1: Từ chối buff và ném ngoại lệ
      throw new StatCapExceededException(statName, newValue, maxCap);
    } else {
      // Trường hợp 2: Chỉ áp dụng phần vừa đủ để lên đúng ngưỡng tối đa
      console.warn(`[${statName}] vượt ngưỡng tối đa. Đã điều chỉnh về mức trần: ${maxCap}`);
      return maxCap;
    }
  }

  return newValue;
};
