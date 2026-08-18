import type {
  BenchmarkProfile,
  BenchmarkQuestion,
  BenchmarkScenario,
  BenchmarkSession
} from "./types.js";

export function createScenario(profile: BenchmarkProfile): BenchmarkScenario {
  return {
    profile,
    sessions: createSessions(profile),
    questions: createQuestions(profile)
  };
}

function createSessions(profile: BenchmarkProfile): BenchmarkSession[] {
  return [
    {
      content: `I work at ${profile.originalEmployer} and I prefer ${profile.originalTheme}.`,
      occurredAt: "2026-08-01T09:00:00.000Z"
    },
    {
      content: `I am building ${profile.project} and I live in ${profile.currentCity}.`,
      occurredAt: "2026-08-03T09:00:00.000Z"
    },
    {
      content: `I am moving to ${profile.destinationCity} next month.`,
      occurredAt: "2026-08-05T09:00:00.000Z"
    },
    {
      content: `I now use ${profile.currentTheme} because of accessibility.`,
      occurredAt: "2026-08-10T09:00:00.000Z"
    },
    {
      content: `I joined ${profile.currentEmployer}.`,
      occurredAt: "2026-08-12T09:00:00.000Z"
    },
    {
      content: `My goal is to ${profile.goal}.`,
      occurredAt: "2026-08-14T09:00:00.000Z"
    },
    {
      content: `I prefer ${profile.originalTheme}.`,
      occurredAt: "2026-08-02T09:00:00.000Z"
    }
  ];
}

function createQuestions(profile: BenchmarkProfile): BenchmarkQuestion[] {
  const { actor } = profile;

  const questions: BenchmarkQuestion[] = [
    question("current-theme", "current", `What theme does ${actor} prefer now?`, {
      preferred_theme: profile.currentTheme
    }, 1),
    question("previous-theme", "temporal", `What did ${actor} prefer before?`, {
      preferred_theme: profile.originalTheme
    }),
    question("as-of-theme", "temporal", `What theme did ${actor} prefer as of 2026-08-05?`, {
      preferred_theme: profile.originalTheme
    }),
    question("current-employer", "current", `What is ${actor}'s employer now?`, {
      employer: profile.currentEmployer
    }),
    question("previous-employer", "temporal", `Who was ${actor}'s previous employer?`, {
      employer: profile.originalEmployer
    }),
    question("current-city", "current", `Where does ${actor} live?`, {
      current_city: profile.currentCity
    }),
    question("destination", "current", `Where is ${actor} moving?`, {
      destination_city: profile.destinationCity
    }),
    question("project", "current", `What is ${actor} building?`, {
      active_project: profile.project
    }),
    question("goal", "current", `What is ${actor}'s goal?`, {
      goal: profile.goal
    }),
    question("city-project", "multi_part", `Where does ${actor} live and what is ${actor} building?`, {
      current_city: profile.currentCity,
      active_project: profile.project
    }),
    {
      id: "absent-food",
      category: "absent",
      question: `What is ${actor}'s favourite food?`,
      expected: { answered: false, values: {} }
    },
    question("profile-summary", "multi_part", `What do you remember about ${actor}?`, {
      preferred_theme: profile.currentTheme,
      employer: profile.currentEmployer,
      current_city: profile.currentCity,
      destination_city: profile.destinationCity,
      active_project: profile.project,
      goal: profile.goal
    })
  ];

  return questions.map((item) => ({
    ...item,
    id: `${profile.id}-${item.id}`
  }));
}

function question(
  id: string,
  category: BenchmarkQuestion["category"],
  text: string,
  values: BenchmarkQuestion["expected"]["values"],
  minimumConflicts?: number
): BenchmarkQuestion {
  return {
    id,
    category,
    question: text,
    expected: {
      answered: true,
      values,
      ...(minimumConflicts === undefined ? {} : { minimumConflicts })
    }
  };
}
