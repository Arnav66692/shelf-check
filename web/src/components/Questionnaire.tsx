"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONDITION_LABELS, EMPTY_PROFILE, type ConditionId, type Profile } from "@/lib/model";
import { useQuestionnaire, type Person } from "@/lib/store";

const CONDITION_IDS = Object.keys(CONDITION_LABELS) as ConditionId[];

const GOALS = [
  { href: "/add", label: "Check what is in my medicine cabinet" },
  { href: "/symptoms", label: "I feel unwell and want to know what I already have for it" },
  { href: "/peptides", label: "I use or am thinking about peptides" },
  { href: "/pills", label: "I found a pill and do not know what it is" },
  { href: "/dose", label: "I need to check an injection dose" },
] as const;

type Answers = { name: string; profile: Profile; goal: string };
type Draft = { personId: string; step: number; answers: Answers; ageText: string };

const MAX_AGE_YEARS = 120;
const WHOLE_YEARS = /^\d{1,3}$/;
const AGE_ERROR = `Type the age in whole years, from 0 to ${MAX_AGE_YEARS}. For a baby under 1 year, type 0. This age is not saved until it is fixed.`;

export function readAge(text: string): { years: number | undefined } | { error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { years: undefined };
  if (!WHOLE_YEARS.test(trimmed)) return { error: AGE_ERROR };
  const years = Number(trimmed);
  return years <= MAX_AGE_YEARS ? { years } : { error: AGE_ERROR };
}

export function AgeField({ text, onChange }: { text: string; onChange: (next: string) => void }) {
  const age = readAge(text);
  const error = "error" in age ? age.error : null;
  return (
    <label className="grid gap-1 font-bold">
      Age in whole years
      <input
        className="field font-normal"
        inputMode="numeric"
        value={text}
        aria-invalid={error !== null}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <span role="alert" className="text-sm font-bold text-[var(--stop-text)]">
          {error}
        </span>
      )}
    </label>
  );
}

function freshDraft(person: Person): Draft {
  return {
    personId: person.id,
    step: 0,
    answers: { name: person.name === "Me" ? "" : person.name, profile: person.profile ?? EMPTY_PROFILE, goal: GOALS[0].href },
    ageText: person.profile?.ageYears?.toString() ?? "",
  };
}

function Choice({ label, checked, onChange, type = "checkbox", name }: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  type?: "checkbox" | "radio";
  name?: string;
}) {
  return (
    <label className="flex items-start gap-3 py-2.5 border-b border-hair cursor-pointer">
      <input
        type={type}
        name={name}
        className="mt-0.5 h-6 w-6 accent-[var(--ink)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function Questionnaire() {
  const router = useRouter();
  const { active, finish } = useQuestionnaire();
  const [saved, setSaved] = useState<Draft | null>(null);
  const draft = saved?.personId === active.id ? saved : freshDraft(active);
  const switched = saved !== null && saved.personId !== active.id;
  const { step, answers } = draft;

  const change = (update: (current: Draft) => Draft) =>
    setSaved((previous) => update(previous?.personId === active.id ? previous : freshDraft(active)));
  const setStep = (next: number) => change((current) => ({ ...current, step: next }));
  const setAnswers = (update: (current: Answers) => Answers) => change((current) => ({ ...current, answers: update(current.answers) }));
  const setProfile = (patch: Partial<Profile>) => setAnswers((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
  const ageError = "error" in readAge(draft.ageText);
  const toggleCondition = (id: ConditionId, on: boolean) =>
    setProfile({
      conditions: on ? [...answers.profile.conditions, id] : answers.profile.conditions.filter((item) => item !== id),
    });
  const noneOfThese = answers.profile.conditions.length === 0;

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Who is this cabinet for?",
      body: (
        <div className="grid gap-4">
          <label className="grid gap-1 font-bold">
            Name
            <input
              className="field font-normal"
              placeholder="Me"
              value={answers.name}
              maxLength={30}
              onChange={(event) => setAnswers((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <AgeField
            text={draft.ageText}
            onChange={(next) => {
              const age = readAge(next);
              change((current) => ({
                ...current,
                ageText: next,
                answers: "error" in age ? current.answers : { ...current.answers, profile: { ...current.answers.profile, ageYears: age.years } },
              }));
            }}
          />
          <p className="text-sm text-ink-soft">Some labels have warnings for children and for people over 60.</p>
        </div>
      ),
    },
    {
      title: "Do any of these apply?",
      body: (
        <div>
          {CONDITION_IDS.map((id) => (
            <Choice
              key={id}
              label={CONDITION_LABELS[id]}
              checked={answers.profile.conditions.includes(id)}
              onChange={(on) => toggleCondition(id, on)}
            />
          ))}
          <Choice label="None of these" checked={noneOfThese} onChange={(on) => on && setProfile({ conditions: [] })} />
        </div>
      ),
    },
    {
      title: "A few more things labels ask about",
      body: (
        <div>
          <Choice label="Pregnant or could be" checked={answers.profile.pregnant} onChange={(pregnant) => setProfile({ pregnant })} />
          <Choice label="Breastfeeding" checked={answers.profile.breastfeeding} onChange={(breastfeeding) => setProfile({ breastfeeding })} />
          <Choice
            label="Three or more alcoholic drinks most days"
            checked={answers.profile.drinksThreeOrMoreDaily}
            onChange={(drinksThreeOrMoreDaily) => setProfile({ drinksThreeOrMoreDaily })}
          />
          <label className="grid gap-1 font-bold mt-4">
            Allergies, separated by commas
            <input
              className="field font-normal"
              placeholder="aspirin, lactose"
              value={answers.profile.allergies.join(", ")}
              onChange={(event) =>
                setProfile({
                  allergies: event.target.value
                    .split(",")
                    .map((item) => item.trimStart())
                    .filter((item, index, all) => item !== "" || index === all.length - 1),
                })
              }
            />
          </label>
        </div>
      ),
    },
    {
      title: "What brings you here today?",
      body: (
        <div>
          {GOALS.map((goal) => (
            <Choice
              key={goal.href}
              type="radio"
              name="goal"
              label={goal.label}
              checked={answers.goal === goal.href}
              onChange={(on) => on && setAnswers((current) => ({ ...current, goal: goal.href }))}
            />
          ))}
        </div>
      ),
    },
  ];

  const last = step === steps.length - 1;

  function next() {
    if (ageError) {
      setStep(0);
      return;
    }
    if (draft.personId !== active.id) return;
    if (!last) {
      setStep(step + 1);
      return;
    }
    const allergies = answers.profile.allergies.map((item) => item.trim()).filter((item) => item !== "");
    finish(answers.name, { ...answers.profile, allergies });
    setSaved(null);
    router.push(answers.goal);
  }

  return (
    <div className="pt-6 max-w-[640px]">
      <p className="text-sm text-ink-soft">
        {step + 1} of {steps.length}. Your answers are saved in this browser, not in an account.
      </p>
      {switched && (
        <p className="mt-2 facts" role="status">
          You switched to {active.name}, so these questions started over for them.
        </p>
      )}
      <h1 className="mt-2 text-3xl font-medium narrow">{steps[step].title}</h1>
      <div className="facts mt-5">{steps[step].body}</div>
      <div className="mt-6 flex flex-wrap gap-3">
        {step > 0 && (
          <button type="button" className="btn btn-quiet" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button type="button" className="btn" onClick={next}>
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
