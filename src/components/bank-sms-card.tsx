import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ConnectionTile, IconMark, TileGrid } from "@/components/ai-provider-parts";
import { Card } from "@/components/drift";
import { getApi } from "@/lib/backend";
import { bankSmsApi, type BankSmsStatus } from "@/lib/bank-sms";
import { t } from "@/lib/i18n";

// A tile like every other service, in a Money card that can take more later. Setup lives on its own screen (/bank-sms).
export function BankSmsCard() {
  const [status, setStatus] = useState<BankSmsStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      bankSmsApi.status(getApi()).then(setStatus, () => setStatus(null));
    }, [])
  );

  const connected = status?.connected ?? false;
  return (
    <Card title={t.pv.svcMoney}>
      <TileGrid>
        <ConnectionTile
          wide
          mark={<IconMark name="message-circle" />}
          name={t.bankSms}
          badge={connected ? "check" : null}
          icons={["credit-card"]}
          label={`${t.bankSms}, ${connected ? t.bankSmsOn : t.bankSmsNotSet}`}
          onPress={() => router.push("/bank-sms")}
        />
      </TileGrid>
    </Card>
  );
}
