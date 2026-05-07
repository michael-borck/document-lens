import { useEffect, useState } from 'react'

/**
 * Returns a value that lags behind the input by `delay` ms — useful for
 * decoupling fast input bindings from expensive downstream work (filters,
 * memoised reductions). The input stays bound so typing feels instant; the
 * derived value only updates once the user stops typing.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
