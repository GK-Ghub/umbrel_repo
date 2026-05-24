import mongoose from 'mongoose';

const tripPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  // Pełna kopia drzewa z Planu
  tree: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // Referencja do oryginału (opcjonalnie, by wiedzieć skąd pochodzi)
  sourcePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
}, { _id: true });

const tripSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Zamiast planIds, mamy teraz zagnieżdżone obiekty z własnymi drzewami
    plans: [tripPlanSchema],
    // Postęp pakowania wciąż na poziomie Trip: nodeId → boolean
    packingProgress: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model('Trip', tripSchema);
