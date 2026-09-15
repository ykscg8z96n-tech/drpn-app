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
  const [selectedTypeFilter, setSelectedTypeFilter] = useState(null); // null | 'event' | 'group'
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const openFilterDrawer = () => {
    setShowFilterDrawer(true);
  };

  const closeFilterDrawer = () => {
    setShowFilterDrawer(false);
  };

  // Neither closes the drawer - picking a category (or the type filter,
  // which already stayed open) shouldn't kick you out of it; closing is
  // an explicit action via the funnel button.
  const selectFilter = (categoryId) => {
    setSelectedFilter(categoryId);
  };

  const clearFilter = () => {
    setSelectedFilter(null);
  };

  const selectTypeFilter = (type) => {
    setSelectedTypeFilter(type);
  };

  const value = {
    selectedFilter,
    selectedTypeFilter,
    showFilterDrawer,
    openFilterDrawer,
    closeFilterDrawer,
    selectFilter,
    clearFilter,
    selectTypeFilter,
  };

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
};