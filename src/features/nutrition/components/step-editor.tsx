import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import type { StepDraft } from '../domain/recipe-draft';

/**
 * The preparation steps and the tags of a recipe (specs 8.6).
 *
 * Both are lists of free text with an add row at the foot — the idiom
 * PortionEditor set — so they share a file rather than each getting one that
 * would read identically. Neither carries a rule beyond "not empty", which the
 * draft validator states once.
 */

export function StepEditor({
  steps,
  onChange,
}: {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
}) {
  const theme = useTheme();

  return (
    <FormSection caption="Étapes">
      {steps.length === 0 ? (
        <FormRow>
          <Text style={[styles.empty, { color: theme.colors.textFaint }]}>
            Aucune étape. Elles sont facultatives : une recette est ses
            ingrédients et son rendement.
          </Text>
        </FormRow>
      ) : null}

      {steps.map((step, index) => (
        // Numbered by position, never by a stored figure: the number is
        // derived from the list, so deleting step 1 renumbers the rest rather
        // than leaving a gap — the same rule the Journal applies to
        // "Collation 2" (D9).
        <FormRow key={index} label={String(index + 1)}>
          <FormInput
            value={step.text}
            onChangeText={(text) =>
              onChange(steps.map((item, at) => (at === index ? { ...item, text } : item)))
            }
            placeholder="Faire revenir l’oignon"
            multiline
            accessibilityLabel={`Étape ${index + 1}`}
          />
          <Pressable
            onPress={() => onChange(steps.filter((_, at) => at !== index))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Supprimer l’étape ${index + 1}`}
          >
            <SymbolView name="minus.circle" size={20} tintColor={theme.colors.danger} />
          </Pressable>
        </FormRow>
      ))}

      <FormRow>
        <Pressable
          onPress={() => onChange([...steps, { id: null, text: '' }])}
          accessibilityRole="button"
          style={styles.add}
        >
          <SymbolView name="plus.circle" size={18} tintColor={theme.colors.accent} />
          <Text style={[styles.addLabel, { color: theme.colors.accent }]}>
            Ajouter une étape
          </Text>
        </Pressable>
      </FormRow>
    </FormSection>
  );
}

export function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const theme = useTheme();

  return (
    <FormSection caption="Tags">
      {tags.length === 0 ? (
        <FormRow>
          <Text style={[styles.empty, { color: theme.colors.textFaint }]}>
            Aucun tag. Ils servent à filtrer la bibliothèque.
          </Text>
        </FormRow>
      ) : null}

      {tags.map((tag, index) => (
        <FormRow key={index}>
          <FormInput
            value={tag}
            onChangeText={(text) =>
              onChange(tags.map((item, at) => (at === index ? text : item)))
            }
            placeholder="végétarien"
            autoCapitalize="none"
            accessibilityLabel={`Tag ${index + 1}`}
          />
          <Pressable
            onPress={() => onChange(tags.filter((_, at) => at !== index))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Supprimer le tag ${tag}`}
          >
            <SymbolView name="minus.circle" size={20} tintColor={theme.colors.danger} />
          </Pressable>
        </FormRow>
      ))}

      <FormRow>
        <Pressable
          onPress={() => onChange([...tags, ''])}
          accessibilityRole="button"
          style={styles.add}
        >
          <SymbolView name="plus.circle" size={18} tintColor={theme.colors.accent} />
          <Text style={[styles.addLabel, { color: theme.colors.accent }]}>Ajouter un tag</Text>
        </Pressable>
      </FormRow>
    </FormSection>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, lineHeight: 18 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  addLabel: { fontSize: 16 },
});
