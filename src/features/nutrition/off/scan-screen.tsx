import { CameraView, useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/core/theme';
import { usePanelHeading } from '@/core/ui/overlay-panel';

/**
 * Scanning a barcode (specs 8.5).
 *
 * > Chain: scan -> search (personal, then cache, then Open Food Facts) ->
 * > quantity screen -> validation. TARGET: UNDER 5 SECONDS.
 *
 * This screen owns only the first link. It reports a barcode and stops; what
 * happens next — personal library, cache, network, or the pre-filled form of
 * specs 8.5 — is the add window's business, and is the same chain a typed
 * search already goes through.
 *
 * ## THE FIRST NATIVE DEPENDENCY SINCE THE PICKER, WITH THE SAME CONSEQUENCE
 *
 * expo-camera has been in section 5 since the start and had never been
 * installed. Installing it means THE BINARY MUST BE REBUILT: the JS bundle
 * does not contain a native module, so `npm run bundle:ios` stays green while
 * this screen crashes on the phone, until GitHub Actions has made a new
 * development build. That is why it is the last step of the slice — everything
 * before it is verifiable over Metro, and this costs one CI cycle rather than
 * being spread over several.
 *
 * ## SCANNING ONCE, AND ONLY ONCE
 *
 * onBarcodeScanned fires repeatedly, several times a second, for as long as a
 * code is in frame. Without a latch the same product would be reported dozens
 * of times — dozens of lookups against a budget of fifteen a minute, which is
 * a ban by IP rather than a glitch. The latch is a ref rather than state
 * because it must take effect on the very next event, not on the next render.
 */

/**
 * The symbologies food carries, and nothing else.
 *
 * EAN-13 is the European retail barcode, EAN-8 its short form for small
 * packets, UPC-A the North American one — Open Food Facts is worldwide.
 * Restricting the list is not tidiness: every extra symbology is more work per
 * frame, and a QR code on a packet is a URL, never a product.
 */
const FOOD_BARCODES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

export function ScanScreen({ onScanned }: { onScanned: (barcode: string) => void }) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);
  const [torch, setTorch] = useState(false);

  usePanelHeading('Scanner', null);

  // Undefined until the permission has been read once. Rendering the refusal
  // during that instant would show a denial nobody has made.
  if (permission === null) return <View style={styles.fill} />;

  if (!permission.granted) {
    return (
      <View style={styles.explain}>
        <Text style={[styles.explainText, { color: theme.colors.text }]}>
          Le scan a besoin de l’appareil photo pour lire un code-barres.
        </Text>
        <Text style={[styles.explainDetail, { color: theme.colors.textMuted }]}>
          Aucune image n’est enregistrée ni envoyée : seul le code-barres est lu, puis
          recherché.
        </Text>

        {/*
          iOS asks ONCE. After a refusal, requestPermission resolves
          immediately without showing anything — canAskAgain says so — and a
          button that appears to do nothing is worse than no button. So the
          second time, the only honest offer is the Settings app.
        */}
        <Pressable
          onPress={() => {
            if (permission.canAskAgain) {
              void requestPermission();
            } else {
              void Linking.openSettings();
            }
          }}
          accessibilityRole="button"
          style={[styles.action, { backgroundColor: theme.colors.accent }]}
        >
          <Text style={[styles.actionLabel, { color: theme.colors.onAccent }]}>
            {permission.canAskAgain ? 'Autoriser l’appareil photo' : 'Ouvrir les Réglages'}
          </Text>
        </Pressable>

        <Text style={[styles.explainDetail, { color: theme.colors.textMuted }]}>
          Vous pouvez aussi chercher le produit par son nom.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={styles.viewfinder}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODES] }}
          onBarcodeScanned={({ data }) => {
            // The latch. See the note above: this fires several times a second.
            if (scanned.current) return;
            const barcode = data.trim();
            if (barcode === '') return;
            scanned.current = true;
            onScanned(barcode);
          }}
        />

        {/*
          A frame drawn over the preview, not a crop of it: the scanner reads
          the whole image whatever this shows. It exists to say where to aim,
          which is the difference between a scan that feels instant and one
          that feels unreliable.
        */}
        <View style={styles.frame} pointerEvents="none">
          <View style={[styles.reticle, { borderColor: theme.colors.onAccent }]} />
        </View>
      </View>

      <View style={styles.controls}>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          Visez le code-barres du produit.
        </Text>
        {/*
          A shelf in a shop is darker than it looks, and the torch is the
          difference between reading a code and holding a phone at it. Named
          rather than a bare glyph on first sight: a lightning bolt reads as
          "flash", which on a camera means something else.
        */}
        <Pressable
          onPress={() => setTorch((on) => !on)}
          accessibilityRole="button"
          accessibilityState={{ selected: torch }}
          style={[styles.torch, { borderColor: theme.colors.border }]}
        >
          <SymbolView
            name={torch ? 'flashlight.on.fill' : 'flashlight.off.fill'}
            size={18}
            tintColor={torch ? theme.colors.accent : theme.colors.textMuted}
          />
          <Text style={[styles.torchLabel, { color: theme.colors.textMuted }]}>
            Éclairage
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  viewfinder: { flex: 1, overflow: 'hidden', borderRadius: 18, margin: 16 },
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: '70%',
    aspectRatio: 1.9,
    maxWidth: '100%',
    borderWidth: 2,
    borderRadius: 12,
    opacity: 0.9,
  },
  controls: { paddingHorizontal: 16, paddingBottom: 16, gap: 12, alignItems: 'center' },
  hint: { fontSize: 15 },
  torch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  torchLabel: { fontSize: 15 },
  explain: { flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  explainText: { fontSize: 17, lineHeight: 23 },
  explainDetail: { fontSize: 14, lineHeight: 20 },
  action: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  actionLabel: { fontSize: 17, fontWeight: '600' },
});
