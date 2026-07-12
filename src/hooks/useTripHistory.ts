import { useState, useEffect } from "react";
import { TripsRepository } from "../repositories/TripsRepository";

export function useTripHistory(companyId: string | null | undefined) {
  const [historicoTrips, setHistoricoTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    if (!companyId) {
      setHistoricoTrips([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = TripsRepository.listenCompanyTrips(
      companyId,
      (trips) => {
        setHistoricoTrips(trips);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching trip history:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [companyId]);

  return { historicoTrips, loading, error };
}
