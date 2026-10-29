import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { savePreference } from "./actions";
import type { PreferenceView } from "./preferences";

/**
 * One small form per type: tick where you want it, then Save. Plain forms, so it works before any
 * script has loaded. Push needs a device that has turned it on; the choice is kept either way.
 */
export function PreferencesForm({ preferences }: { preferences: PreferenceView[] }) {
  return (
    <Card>
      <CardLabel>What to tell me about</CardLabel>
      <ul className="border-line mt-4 border-t">
        {preferences.map(({ info, inApp, push }) => (
          <li key={info.type} className="border-line border-b py-4">
            <form action={savePreference} aria-label={info.label} className="flex flex-col gap-3">
              <input type="hidden" name="type" value={info.type} />
              <div>
                <p className="font-medium">{info.label}</p>
                <p className="text-muted text-sm">{info.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-6">
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    name="in_app"
                    defaultChecked={inApp}
                    className="accent-ink size-5"
                  />
                  <span>In the app</span>
                </label>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    name="push"
                    defaultChecked={push}
                    className="accent-ink size-5"
                  />
                  <span>Push to my phone</span>
                </label>
                <Button type="submit" variant="secondary" className="ml-auto">
                  Save
                </Button>
              </div>
            </form>
          </li>
        ))}
      </ul>
      <p className="text-muted mt-4 text-sm">
        Everything you turn push off for still arrives in the app. Turning “In the app” off stops
        that kind of notification altogether.
      </p>
    </Card>
  );
}
