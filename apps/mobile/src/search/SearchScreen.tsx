import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type {
  SearchResultItem,
  SearchResultType,
  SearchCategoryFilter,
} from '@teamtrack/shared-types';

export interface MobileSearchScreenProps {
  onSearch: (q: string, type?: SearchCategoryFilter) => Promise<SearchResultItem[]>;
  onNavigate?: (item: SearchResultItem) => void;
  onClose: () => void;
}

const CATEGORIES: Array<{ key: SearchCategoryFilter; label: string; icon: string }> = [
  { key: 'all', label: 'All', icon: '🔍' },
  { key: 'messages', label: 'Messages', icon: '💬' },
  { key: 'users', label: 'People', icon: '@' },
  { key: 'channels', label: 'Channels', icon: '#' },
  { key: 'teams', label: 'Teams', icon: '👥' },
  { key: 'meetings', label: 'Meetings', icon: '📅' },
  { key: 'files', label: 'Files', icon: '📄' },
];

function getBadgeColor(type: SearchResultType): { bg: string; text: string } {
  switch (type) {
    case 'user':
      return { bg: 'rgba(168, 85, 247, 0.2)', text: '#c084fc' };
    case 'channel':
      return { bg: 'rgba(34, 197, 94, 0.2)', text: '#4ade80' };
    case 'team':
      return { bg: 'rgba(14, 165, 233, 0.2)', text: '#38bdf8' };
    case 'message':
      return { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' };
    case 'meeting':
      return { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' };
    case 'file':
      return { bg: 'rgba(244, 63, 94, 0.2)', text: '#fb7185' };
    case 'conversation':
    default:
      return { bg: 'rgba(148, 163, 184, 0.2)', text: '#94a3b8' };
  }
}

export function MobileSearchScreen({
  onSearch,
  onNavigate,
  onClose,
}: MobileSearchScreenProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategoryFilter>('all');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const executeSearch = async (text: string, cat: SearchCategoryFilter) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    try {
      const items = await onSearch(trimmed, cat === 'all' ? undefined : cat);
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryPress = (cat: SearchCategoryFilter) => {
    setActiveCategory(cat);
    if (query.trim()) {
      executeSearch(query, cat);
    }
  };

  const handleSubmit = () => {
    executeSearch(query, activeCategory);
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search TeamTrack..."
            placeholderTextColor="#64748b"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Category Pills */}
      <View style={styles.categoryRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            const isSelected = activeCategory === item.key;
            return (
              <TouchableOpacity
                onPress={() => handleCategoryPress(item.key)}
                style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
              >
                <Text style={styles.categoryIcon}>{item.icon}</Text>
                <Text
                  style={[
                    styles.categoryLabel,
                    isSelected && styles.categoryLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Results Content */}
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : hasSearched && results.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>No results found</Text>
          <Text style={styles.emptySubtitle}>Try adjusting your search terms</Text>
        </View>
      ) : !hasSearched ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Search TeamTrack</Text>
          <Text style={styles.emptySubtitle}>
            Find teammates, channels, conversations, files, and meetings
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const colors = getBadgeColor(item.type);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => onNavigate?.(item)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.badgeText, { color: colors.text }]}>
                      {item.type.toUpperCase()}
                    </Text>
                  </View>
                </View>
                {item.subtitle && (
                  <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                )}
                {item.snippet && (
                  <Text style={styles.cardSnippet} numberOfLines={2}>
                    {item.snippet}
                  </Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    paddingHorizontal: 10,
    height: 42,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    padding: 0,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  closeBtn: {
    paddingVertical: 8,
  },
  closeBtnText: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '600',
  },
  categoryRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  categoryPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3b82f6',
  },
  categoryIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  categoryLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  categoryLabelActive: {
    color: '#60a5fa',
    fontWeight: '600',
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  cardSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 4,
  },
  cardSnippet: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
