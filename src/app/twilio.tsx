import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { SetupCard } from "@/components/phone-setup-card";
import { Loading, Screen } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { callsApi, type PhoneSetup } from "@/lib/phone-calls";

// Connections → Twilio: the account calls go out through. Calls for me (src/app/phone-calls.tsx) uses it.
export default function Twilio() {
  const [setup, setSetup] = useState<PhoneSetup | null | undefined>(undefined);
  const load = useCallback(() => {
    void callsApi
      .setup(getApi())
      .then(setSetup)
      .catch(() => setSetup(null));
  }, []);
  useFocusEffect(load);

  return <Screen>{setup === undefined ? <Loading /> : <SetupCard key={`${setup?.from_number}-${setup?.voice}`} setup={setup} onSaved={(next) => (next ? setSetup(next) : load())} />}</Screen>;
}
