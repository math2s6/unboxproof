/**
 * Simulated AI analysis for unboxing verification.
 * In production, this would call Google Vision AI, AWS Rekognition, etc.
 */

function analyzeUnboxing({ hasVideo, photoCount, codeVisible, conditionOk }) {
  let score = 0.5;
  const flags = [];
  const positives = [];

  if (hasVideo) { score += 0.15; positives.push('Vidéo fournie'); }
  else { score -= 0.05; flags.push('Aucune vidéo (recommandé)'); }

  if (photoCount >= 3) { score += 0.1; positives.push(`${photoCount} photos fournies`); }
  else if (photoCount >= 1) { score += 0.05; }
  else { score -= 0.2; flags.push('Aucune photo'); }

  if (codeVisible) { score += 0.15; positives.push('Code de vérification visible'); }
  else { score -= 0.25; flags.push('⚠️ Code non visible — risque de fraude'); }

  if (conditionOk) { score += 0.1; positives.push('Produit conforme selon le client'); }
  else { score -= 0.1; flags.push('⚠️ Client signale une non-conformité'); }

  // Realistic randomness
  score += (Math.random() - 0.5) * 0.08;
  score = Math.max(0.05, Math.min(0.99, score));

  const confidence = parseFloat(score.toFixed(2));
  const recommendation = confidence >= 0.75 ? 'approve' : confidence >= 0.5 ? 'review' : 'dispute';
  const label = confidence >= 0.75 ? 'Unboxing valide ✅' : confidence >= 0.5 ? 'Vérification recommandée ⚠️' : 'Litige suggéré 🚨';

  return { confidence, recommendation, label, flags, positives };
}

module.exports = { analyzeUnboxing };
