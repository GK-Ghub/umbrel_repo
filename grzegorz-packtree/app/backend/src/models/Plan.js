import mongoose from 'mongoose';

const treeNodeSchema = new mongoose.Schema(
  {
    elementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Element', required: true },
    name:      { type: String, required: true },
    state:     { type: String, default: '' },
    quantity:  { type: Number, default: 1, min: 1 },
    children:  { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: true }
);

const templateSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    tree:        { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

const planSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true, trim: true },
    description:     { type: String, default: '' },
    usedElementIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Element' }],
    tree:            { type: [treeNodeSchema], default: [] },
    status:          { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    // Persisted packing progress: nodeId → true/false
    packingProgress: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Template = mongoose.model('Template', templateSchema);
export default mongoose.model('Plan', planSchema);
