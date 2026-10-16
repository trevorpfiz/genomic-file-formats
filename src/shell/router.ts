// Hash routes (docs/PLAN.md D-22, 11.3). `history.pushState` to another path throws on file://,
// so every route lives in the hash.
export type Route =
  | { name: "home" }
  | { name: "lesson"; slug: string; target?: string }
  | { name: "quiz"; section: string }
  | { name: "capstone" }
  | { name: "badge" }
  | { name: "about" }
  | { name: "not-found"; hash: string };

const SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";
const LESSON = new RegExp(`^#/lesson/(${SEGMENT})(?:/([a-z0-9-]+))?/?$`);
const QUIZ = new RegExp(`^#/quiz/(${SEGMENT})/?$`);

export function parseRoute(hash: string): Route {
  if (hash === "" || hash === "#" || hash === "#/") return { name: "home" };
  const lesson = LESSON.exec(hash);
  if (lesson)
    return lesson[2]
      ? { name: "lesson", slug: lesson[1]!, target: lesson[2] }
      : { name: "lesson", slug: lesson[1]! };
  const quiz = QUIZ.exec(hash);
  if (quiz) return { name: "quiz", section: quiz[1]! };
  if (hash === "#/capstone") return { name: "capstone" };
  if (hash === "#/badge") return { name: "badge" };
  if (hash === "#/about") return { name: "about" };
  return { name: "not-found", hash };
}

export const lessonHref = (slug: string, target?: string): string =>
  `#/lesson/${slug}${target ? `/${target}` : ""}`;
