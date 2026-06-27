import { useState, useEffect } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizeTrip, NormalizedTrip } from "../lib/tripNormalizer";

export function useTripsRealtime() {
  const [trips, setTrips] = useState<NormalizedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "historico_viagens"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return normalizeTrip({ id: doc.id, ...data });
      });
      setTrips(tripsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching trips:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { trips, loading };
}
