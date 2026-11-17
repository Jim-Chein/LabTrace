import { describe, expect, it } from "vitest";
import { detectFutureTimes, upcomingMentions } from "./dates";
import { DEMO_LID_NOTES, DEMO_NOW } from "../data/seed";

const now = new Date(2026, 8, 8, 11, 30, 0);

describe("detectFutureTimes", () => {
  it("reads month/day times and turns a dose into a 加药 task", () => {
    const found = detectFutureTimes("9/9 14:00 Glu 1 mM，刺激 6 h", now);
    expect(found).toHaveLength(1);
    expect(found[0].content).toBe("Glu 1 mM 加药");
    const due = new Date(found[0].dueAt);
    expect(due.getMonth()).toBe(8);
    expect(due.getDate()).toBe(9);
    expect(due.getHours()).toBe(14);
    expect(due.getMinutes()).toBe(0);
  });

  it("keeps a bare clock time on the preceding date line", () => {
    const found = detectFutureTimes(DEMO_LID_NOTES, DEMO_NOW);
    expect(found.map((item) => item.content)).toEqual(["Glu 1 mM 加药", "测 NLuc"]);
    const evening = new Date(found[1].dueAt);
    expect(evening.getDate()).toBe(9);
    expect(evening.getHours()).toBe(20);
    expect(evening.getMinutes()).toBe(0);
  });

  it("does not suggest past lines from the same note", () => {
    expect(detectFutureTimes("9/7 14:00 铺板", now)).toEqual([]);
    expect(detectFutureTimes("9/8 10:00 转染", now)).toEqual([]);
  });

  it("resolves 今天 / 明天 / 后天 and afternoon hours", () => {
    const tomorrow = detectFutureTimes("明天 14:00 换液", now);
    expect(tomorrow[0].content).toBe("换液");
    expect(new Date(tomorrow[0].dueAt).getDate()).toBe(9);

    const today = detectFutureTimes("今天 15:00 准备转染试剂", now);
    expect(new Date(today[0].dueAt).getHours()).toBe(15);
    expect(today[0].content).toBe("准备转染试剂");

    const later = detectFutureTimes("后天 9:00 收样", now);
    expect(new Date(later[0].dueAt).getDate()).toBe(10);
    expect(new Date(later[0].dueAt).getHours()).toBe(9);

    const afternoon = detectFutureTimes("明天下午3点开会", now);
    expect(new Date(afternoon[0].dueAt).getHours()).toBe(15);
    expect(afternoon[0].content).toBe("开会");
  });

  it("accepts 月日, ISO dates, and fullwidth colons", () => {
    const cn = detectFutureTimes("9月9日14:00测板", now);
    expect(new Date(cn[0].dueAt).getDate()).toBe(9);
    expect(cn[0].content).toBe("测板");

    const iso = detectFutureTimes("2026-09-10 08:30 换液", now);
    expect(new Date(iso[0].dueAt).getDate()).toBe(10);
    expect(new Date(iso[0].dueAt).getHours()).toBe(8);

    const wide = detectFutureTimes("9/10 14：00 加样", now);
    expect(wide[0].content).toBe("加样");
    expect(new Date(wide[0].dueAt).getHours()).toBe(14);
  });

  it("uses chrono zh for weekday phrases", () => {
    const found = detectFutureTimes("下周一 10:00 组会", now);
    expect(found).toHaveLength(1);
    expect(new Date(found[0].dueAt).getDay()).toBe(1);
    expect(new Date(found[0].dueAt).getDate()).toBe(14);
    expect(found[0].content).toBe("组会");
  });

  it("leaves a bare time on today when no date came before it", () => {
    const found = detectFutureTimes("20:00 测 NLuc", now);
    expect(found).toHaveLength(1);
    expect(new Date(found[0].dueAt).getDate()).toBe(8);
    expect(new Date(found[0].dueAt).getHours()).toBe(20);
    expect(found[0].content).toBe("测 NLuc");
  });

  it("remembers ignored suggestions by fingerprint", () => {
    const [first] = detectFutureTimes(DEMO_LID_NOTES, DEMO_NOW);
    const left = upcomingMentions(DEMO_LID_NOTES, DEMO_NOW, new Set([first.fingerprint]));
    expect(left.map((item) => item.content)).toEqual(["测 NLuc"]);
    expect(upcomingMentions("   ", now, new Set())).toEqual([]);
  });
});
