import mongoose from 'mongoose';

const elementSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    weight: { type: Number, default: 0, min: 0 }, // grams
    categories: {
      type: [String],
      enum: ['Electronics', 'Clothing', 'Food', 'Tools', 'Hygiene', 'Documents', 'Other'],
      default: [],
    },
    imagePath: { type: String, default: null }, // relative path under /uploads
    isContainer: { type: Boolean, default: false },
    isReturnable: { type: Boolean, default: true },
    isLastMinute: { type: Boolean, default: false },
    // Default contents (references to other Elements)
    // Used when adding this container to a new plan
    defaultContents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Element' }],
  },
  { timestamps: true }
);

elementSchema.index({ name: 'text', description: 'text' });

export default mongoose.model('Element', elementSchema);
