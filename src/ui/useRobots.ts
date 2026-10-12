import { useCallback, useEffect, useState } from 'react';
import { listRobots, type RobotEntry } from '../robots/registry';

export function useRobots() {
  const [robots, setRobots] = useState<RobotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setRobots(await listRobots());
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { robots, loading, refresh };
}
