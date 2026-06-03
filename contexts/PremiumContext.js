import React, { createContext, useContext, useMemo, useState } from 'react';

const PremiumContext = createContext(null);

const initialPremiumState = {
  isPremium: false,
  selectedPlan: 'yearly',
  source: 'Not checked',
  status: 'idle',
  error: '',
  expirationDate: null,
  managementURL: null,
  productIdentifier: null
};

export function PremiumProvider({ children }) {
  const [premiumState, setPremiumState] = useState(initialPremiumState);

  const value = useMemo(() => ({
    ...premiumState,
    hasPremiumAccess: Boolean(premiumState.isPremium),
    setPremiumState: (nextState) => {
      setPremiumState((current) => ({
        ...current,
        ...nextState
      }));
    },
    resetPremiumState: () => setPremiumState(initialPremiumState)
  }), [premiumState]);

  return (
    <PremiumContext.Provider value={value}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const context = useContext(PremiumContext);
  if (!context) {
    throw new Error('usePremium must be used inside PremiumProvider');
  }
  return context;
}
