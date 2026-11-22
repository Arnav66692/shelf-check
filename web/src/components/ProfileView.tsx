"use client";

import { useState } from "react";
import { CONDITION_LABELS, type ConditionId, type Profile } from "@/lib/model";
import { useHousehold, useProfile } from "@/lib/store";
import { AgeField, readAge } from "./Questionnaire";

const CONDITION_IDS = Object.keys(CONDITION_LABELS) as ConditionId[];

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 py-2 border-b border-hair cursor-pointer">
      <input
        type="checkbox"
        className="mt-0.5 h-6 w-6 accent-[var(--ink)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function ProfileView() {
  const { profile, save } = useProfile();
  const { active } = useHousehold();
  const [ageDraft, setAgeDraft] = useState<{ personId: string; text: string } | null>(null);
  const ageText = ageDraft?.personId === active.id ? ageDraft.text : (profile.ageYears?.toString() ?? "");
  const update = (patch: Partial<Profile>) => save({ ...profile, ...patch });
  const toggleCondition = (id: ConditionId, on: boolean) =>
    update({ conditions: on ? [...profile.conditions, id] : profile.conditions.filter((item) => item !== id) });

  return (
    <div className="pt-6 max-w-[760px]">
      <h1 className="text-3xl font-medium narrow">About you</h1>
      <p className="mt-3">
        Labels carry warnings for certain people. Tick what applies and Shelf Check will show the label lines written
        for you. This is saved in this browser, not in an account.
      </p>

      <div className="facts mt-6">
        <h2 className="facts-title">Health</h2>
        {CONDITION_IDS.map((id) => (
          <Check
            key={id}
            label={CONDITION_LABELS[id]}
            checked={profile.conditions.includes(id)}
            onChange={(on) => toggleCondition(id, on)}
          />
        ))}
        <Check label="Pregnant" checked={profile.pregnant} onChange={(pregnant) => update({ pregnant })} />
        <Check label="Breastfeeding" checked={profile.breastfeeding} onChange={(breastfeeding) => update({ breastfeeding })} />
        <Check
          label="Three or more alcoholic drinks most days"
          checked={profile.drinksThreeOrMoreDaily}
          onChange={(drinksThreeOrMoreDaily) => update({ drinksThreeOrMoreDaily })}
        />
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <AgeField
          text={ageText}
          onChange={(next) => {
            setAgeDraft({ personId: active.id, text: next });
            const age = readAge(next);
            if (!("error" in age)) update({ ageYears: age.years });
          }}
        />
        <label className="grid gap-1 font-bold">
          Allergies, separated by commas
          <input
            className="field font-normal"
            placeholder="aspirin, lactose"
            value={profile.allergies.join(", ")}
            onChange={(event) =>
              update({ allergies: event.target.value.split(",").map((item) => item.trimStart()).filter((item, index, all) => item !== "" || index === all.length - 1) })
            }
          />
        </label>
      </div>
    </div>
  );
}
