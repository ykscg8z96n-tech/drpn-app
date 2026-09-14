// mobile/src/utils/categories.js
import { Ionicons } from '@expo/vector-icons';

export const CATEGORIES = {
  TABLETOP: {
    id: 'tabletop',
    name: 'Table Top',
    icon: 'cube-outline', // Using cube as dice alternative
    color: '#8B4513',
    description: 'Board games, dice games, and tabletop gaming'
  },
  CARDS: {
    id: 'cards',
    name: 'Cards',
    icon: 'albums-outline', // Using albums as cards alternative
    color: '#DC143C',
    description: 'Card games, poker, and card-based activities'
  },
  FANTASY: {
    id: 'fantasy',
    name: 'Fantasy',
    icon: 'trophy-outline',
    color: '#FFD700',
    description: 'RPGs, fantasy sports, and fantasy gaming'
  },
  SPORTS: {
    id: 'sports',
    name: 'Sports',
    icon: 'basketball-outline',
    color: '#FF6B35',
    description: 'Physical sports and athletic activities'
  },
  GOLF: {
    id: 'golf',
    name: 'Golf',
    icon: 'golf-outline',
    color: '#228B22',
    description: 'Golf and golf-related activities'
  },
  HEALTH: {
    id: 'health',
    name: 'Health',
    icon: 'body-outline', // Using body as yoga alternative
    color: '#9370DB',
    description: 'Fitness, wellness, and health activities'
  }
};

// Array of all categories for easy iteration
export const CATEGORIES_ARRAY = Object.values(CATEGORIES);

// Get category by ID
export const getCategoryById = (id) => {
  return CATEGORIES_ARRAY.find(cat => cat.id === id);
};

// Validate category ID
export const isValidCategory = (id) => {
  return CATEGORIES_ARRAY.some(cat => cat.id === id);
};

// Get all category IDs
export const getAllCategoryIds = () => {
  return CATEGORIES_ARRAY.map(cat => cat.id);
};

// Category Badge Component
export const CategoryBadge = ({ category, size = 'medium', style }) => {
  const categoryInfo = getCategoryById(category);
  if (!categoryInfo) return null;

  const sizes = {
    small: { padding: 6, fontSize: 10, iconSize: 12 },
    medium: { padding: 8, fontSize: 12, iconSize: 16 },
    large: { padding: 12, fontSize: 14, iconSize: 20 }
  };

  const sizeConfig = sizes[size] || sizes.medium;

  return (
    <View style={[
      {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: categoryInfo.color,
        paddingHorizontal: sizeConfig.padding,
        paddingVertical: sizeConfig.padding / 2,
        borderRadius: sizeConfig.padding * 1.5,
        alignSelf: 'flex-start'
      },
      style
    ]}>
      <Ionicons 
        name={categoryInfo.icon} 
        size={sizeConfig.iconSize} 
        color="white" 
      />
      <Text style={{
        color: 'white',
        fontSize: sizeConfig.fontSize,
        fontWeight: '600',
        marginLeft: 4
      }}>
        {categoryInfo.name}
      </Text>
    </View>
  );
};

// Category Icon Component
export const CategoryIcon = ({ category, size = 20, color }) => {
  const categoryInfo = getCategoryById(category);
  if (!categoryInfo) return null;

  return (
    <Ionicons 
      name={categoryInfo.icon} 
      size={size} 
      color={color || categoryInfo.color} 
    />
  );
};