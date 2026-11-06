import { useEffect, useState } from "react";

// The clock ticks once a minute, on the minute.
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setNow(new Date());
      timer = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, []);
  return now;
}
