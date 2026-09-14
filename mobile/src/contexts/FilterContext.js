// mobile/src/contexts/FilterContext.js
import React, { createContext, useContext, useState } from 'react';

const FilterContext = createContext();

export const useFilter = () => {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
};

export const FilterProvider = ({ children }) => {
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const openFilterDrawer = () => {
    setShowFilterDrawer(true);
  };

  const closeFilterDrawer = () => {
    setShowFilterDrawer(false);
  };

  const selectFilter = (categoryId) => {
    setSelectedFilter(categoryId);
    closeFilterDrawer();
  };

  const clearFilter = () => {
    setSelectedFilter(null);
    closeFilterDrawer();
  };

  const value = {
    selectedFilter,
    showFilterDrawer,
    openFilterDrawer,
    closeFilterDrawer,
    selectFilter,
    clearFilter,
  };

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
};