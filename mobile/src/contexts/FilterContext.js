// mobile/src/contexts/FilterContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FilterContext = createContext();

const BROWSE_LOCATION_STORAGE_KEY = 'drpn:browseLocation';

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

  // Lets someone browse events/groups somewhere other than where they
  // currently are (e.g. planning a trip's pickup game before you arrive),
  // overriding the live-GPS-based search used everywhere else. Persisted
  // so it survives an app restart instead of silently reverting to "near
  // me" - it has to be explicitly cleared to go back to that.
  const [browseLocation, setBrowseLocationState] = useState(null); // { latitude, longitude, label, radiusKm } | null
  const [showLocationFilter, setShowLocationFilter] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BROWSE_LOCATION_STORAGE_KEY)
      .then((raw) => {
        if (raw) setBrowseLocationState(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  const setBrowseLocation = (location) => {
    setBrowseLocationState(location);
    AsyncStorage.setItem(BROWSE_LOCATION_STORAGE_KEY, JSON.stringify(location)).catch(() => {});
  };

  const clearBrowseLocation = () => {
    setBrowseLocationState(null);
    AsyncStorage.removeItem(BROWSE_LOCATION_STORAGE_KEY).catch(() => {});
  };

  const openLocationFilter = () => setShowLocationFilter(true);
  const closeLocationFilter = () => setShowLocationFilter(false);

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
    browseLocation,
    setBrowseLocation,
    clearBrowseLocation,
    showLocationFilter,
    openLocationFilter,
    closeLocationFilter,
  };

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
};