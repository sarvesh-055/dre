/**
 * =====================================================
 * FASHION MARKETPLACE - MONGODB SCHEMAS
 * Enterprise Multi-Vendor E-Commerce Platform
 * =====================================================
 * Purpose: Product Catalog, Reviews, Carts, Wishlists, Logs
 * Database: MongoDB 6+
 * =====================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Enable strict query mode for production safety
mongoose.set('strictQuery', true);

// =====================================================
// CONNECTION CONFIGURATION
// =====================================================

const mongoConfig = {
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true,
  readPreference: 'primaryPreferred',
  writeConcern: { w: 'majority', j: true, wtimeout: 5000 }
};

// =====================================================
// 1. PRODUCT CATALOG SCHEMAS
// =====================================================

/**
 * Category Schema
 * Hierarchical category structure with infinite nesting
 */
const categorySchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  parentCategory: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  level: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  path: {
    type: String,
    required: true
  },
  description: {
    type: String,
    maxlength: 2000
  },
  image: {
    url: String,
    alt: String
  },
  banner: {
    url: String,
    alt: String
  },
  metaTitle: String,
  metaDescription: String,
  metaKeywords: [String],
  attributes: [{
    name: String,
    values: [String],
    inputType: {
      type: String,
      enum: ['text', 'select', 'multiselect', 'range', 'color'],
      default: 'select'
    },
    isFilterable: { type: Boolean, default: true },
    isVisible: { type: Boolean, default: true }
  }],
  brands: [{
    type: Schema.Types.ObjectId,
    ref: 'Brand'
  }],
  commissionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  metadata: Schema.Types.Mixed
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
categorySchema.index({ slug: 1 });
categorySchema.index({ parentCategory: 1 });
categorySchema.index({ level: 1 });
categorySchema.index({ path: 1 });
categorySchema.index({ isActive: 1, sortOrder: 1 });

// Virtual for child categories
categorySchema.virtual('childCategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parentCategory'
});

/**
 * Brand Schema
 */
const brandSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  logo: {
    url: String,
    alt: String
  },
  banner: {
    url: String,
    alt: String
  },
  description: String,
  websiteUrl: String,
  countryOfOrigin: String,
  categories: [{
    type: Schema.Types.ObjectId,
    ref: 'Category'
  }],
  metaTitle: String,
  metaDescription: String,
  metaKeywords: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  popularity: {
    type: Number,
    default: 0
  },
  metadata: Schema.Types.Mixed
}, {
  timestamps: true
});

brandSchema.index({ slug: 1 });
brandSchema.index({ isActive: 1, isFeatured: 1 });
brandSchema.index({ popularity: -1 });

/**
 * Size Chart Schema
 */
const sizeChartSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  gender: {
    type: String,
    enum: ['men', 'women', 'unisex', 'kids'],
    required: true
  },
  unit: {
    type: String,
    enum: ['cm', 'inches'],
    default: 'cm'
  },
  sizes: [{
    label: String, // S, M, L, XL, etc.
    measurements: {
      chest: Number,
      waist: Number,
      hips: Number,
      length: Number,
      shoulder: Number,
      sleeve: Number
    },
    equivalentSizes: {
      us: String,
      uk: String,
      eu: String,
      it: String
    }
  }]
}, {
  timestamps: true
});

sizeChartSchema.index({ category: 1, gender: 1 });

/**
 * Product Schema
 * Deeply nested variants with comprehensive attributes
 */
const productSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: 5000
  },
  shortDescription: {
    type: String,
    maxlength: 500
  },
  vendor: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  brand: {
    type: Schema.Types.ObjectId,
    ref: 'Brand'
  },
  categories: [{
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  }],
  primaryCategory: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  
  // Base pricing (can be overridden by variants)
  basePrice: {
    type: Number,
    required: true,
    min: 0
  },
  mrp: {
    type: Number,
    required: true,
    min: 0
  },
  costPrice: {
    type: Number,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true
  },
  
  // Variants (SKU-level data)
  variants: [{
    sku: {
      type: String,
      required: true,
      trim: true
    },
    barcode: String,
    isbn: String,
    
    // Variant-specific attributes
    attributes: {
      color: String,
      size: String,
      pattern: String,
      fit: String,
      occasion: String,
      sleeve: String,
      neckline: String,
      material: String
    },
    
    // Pricing overrides
    price: Number,
    mrp: Number,
    costPrice: Number,
    
    // Inventory
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 10
    },
    isInStock: {
      type: Boolean,
      default: true
    },
    allowBackorder: {
      type: Boolean,
      default: false
    },
    estimatedRestockDate: Date,
    
    // Physical properties
    weight: {
      value: Number,
      unit: { type: String, enum: ['g', 'kg'], default: 'g' }
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: { type: String, enum: ['cm', 'in'], default: 'cm' }
    },
    
    // Media per variant
    images: [{
      url: { type: String, required: true },
      alt: String,
      type: { type: String, enum: ['front', 'back', 'side', 'detail', 'lifestyle'], default: 'front' },
      sortOrder: Number,
      thumbnailUrl: String,
      webpUrl: String
    }],
    
    isActive: { type: Boolean, default: true },
    isPrimary: { type: Boolean, default: false }
  }],
  
  // Product-level attributes
  attributes: {
    fabric: String,
    fabricCare: String,
    pattern: String,
    fit: String,
    occasion: String,
    sleeve: String,
    neckline: String,
    length: String,
    washCare: String,
    countryOfOrigin: String,
    manufacturer: String,
    importer: String,
    packer: String,
    genericName: String
  },
  
  // Size chart reference
  sizeChart: {
    type: Schema.Types.ObjectId,
    ref: 'SizeChart'
  },
  
  // Media gallery (product-level)
  images: [{
    url: { type: String, required: true },
    alt: String,
    type: { type: String, enum: ['front', 'back', 'side', 'detail', 'lifestyle'], default: 'front' },
    sortOrder: Number,
    thumbnailUrl: String,
    webpUrl: String
  }],
  
  videos: [{
    url: { type: String, required: true },
    thumbnailUrl: String,
    duration: Number,
    type: { type: String, enum: ['product_video', 'review', 'tutorial'] }
  }],
  
  // 360-degree view
  view360: {
    isEnabled: { type: Boolean, default: false },
    frames: [String], // Array of image URLs
    frameCount: Number
  },
  
  // Ratings & reviews summary (denormalized)
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 },
    distribution: {
      5: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      1: { type: Number, default: 0 }
    }
  },
  
  // Sales metrics (denormalized for sorting)
  salesMetrics: {
    totalSold: { type: Number, default: 0 },
    last30DaysSold: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    wishlistCount: { type: Number, default: 0 },
    cartCount: { type: Number, default: 0 },
    returnRate: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 }
  },
  
  // SEO
  metaTitle: String,
  metaDescription: String,
  metaKeywords: [String],
  canonicalUrl: String,
  
  // Shipping
  shippingInfo: {
    freeShipping: { type: Boolean, default: false },
    shippingWeight: Number,
    shippingDimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    fragile: { type: Boolean, default: false },
    hazardous: { type: Boolean, default: false },
    codAvailable: { type: Boolean, default: true },
    returnable: { type: Boolean, default: true },
    returnWindow: { type: Number, default: 30 } // days
  },
  
  // Tax
  taxClass: {
    type: String,
    enum: ['standard', 'reduced', 'zero', 'exempt'],
    default: 'standard'
  },
  gstRate: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  
  // Status & visibility
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive', 'out_of_stock', 'discontinued'],
    default: 'draft'
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'hidden'],
    default: 'public'
  },
  publishedAt: Date,
  
  // Tags & collections
  tags: [String],
  collections: [{
    type: Schema.Types.ObjectId,
    ref: 'Collection'
  }],
  
  // Related products (AI-curated)
  relatedProducts: [{
    productId: Schema.Types.ObjectId,
    score: Number,
    reason: String
  }],
  
  // Frequently bought together
  frequentlyBoughtTogether: [{
    productId: Schema.Types.ObjectId,
    discount: Number
  }],
  
  // Moderation
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  moderatedBy: Schema.Types.ObjectId,
  moderatedAt: Date,
  moderationNotes: String,
  
  // Metadata
  customFields: Schema.Types.Mixed,
  externalIds: {
    googleProductId: String,
    facebookProductId: String,
    amazonAsin: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
productSchema.index({ slug: 1 });
productSchema.index({ vendor: 1, status: 1 });
productSchema.index({ primaryCategory: 1, status: 1 });
productSchema.index({ categories: 1, status: 1 });
productSchema.index({ brand: 1, status: 1 });
productSchema.index({ 'variants.sku': 1 });
productSchema.index({ 'variants.stock': 1, status: 1 });
productSchema.index({ 'rating.average': -1, status: 1 });
productSchema.index({ 'salesMetrics.totalSold': -1, status: 1 });
productSchema.index({ publishedAt: -1, status: 1 });
productSchema.index({ tags: 1, status: 1 });
productSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Virtual for total stock
productSchema.virtual('totalStock').get(function() {
  return this.variants.reduce((sum, variant) => sum + variant.stock, 0);
});

// Virtual for minimum price
productSchema.virtual('minPrice').get(function() {
  const prices = this.variants.map(v => v.price || this.basePrice);
  return Math.min(...prices);
});

// Virtual for maximum price
productSchema.virtual('maxPrice').get(function() {
  const prices = this.variants.map(v => v.price || this.basePrice);
  return Math.max(...prices);
});

// Pre-save middleware to update derived fields
productSchema.pre('save', function(next) {
  // Update stock status
  const totalStock = this.variants.reduce((sum, v) => sum + v.stock, 0);
  if (totalStock === 0 && this.status === 'active') {
    this.status = 'out_of_stock';
  } else if (totalStock > 0 && this.status === 'out_of_stock') {
    this.status = 'active';
  }
  
  // Set primary variant if none exists
  const hasPrimary = this.variants.some(v => v.isPrimary);
  if (!hasPrimary && this.variants.length > 0) {
    this.variants[0].isPrimary = true;
  }
  
  next();
});

/**
 * Review Schema
 */
const reviewSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderItem: {
    type: Schema.Types.ObjectId,
    ref: 'OrderItem'
  },
  variant: {
    type: Schema.Types.ObjectId
  },
  
  // Rating
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  ratings: {
    quality: Number,
    fit: Number,
    value: Number,
    comfort: Number
  },
  
  // Content
  title: {
    type: String,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  
  // Media
  images: [{
    url: String,
    thumbnailUrl: String,
    caption: String
  }],
  videos: [{
    url: String,
    thumbnailUrl: String,
    duration: Number
  }],
  
  // Verification
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  
  // Helpfulness
  helpfulCount: {
    type: Number,
    default: 0
  },
  notHelpfulCount: {
    type: Number,
    default: 0
  },
  votedBy: [{
    user: Schema.Types.ObjectId,
    vote: { type: String, enum: ['helpful', 'not_helpful'] }
  }],
  
  // Vendor response
  vendorResponse: {
    content: String,
    respondedAt: Date,
    respondedBy: Schema.Types.ObjectId
  },
  
  // AI analysis
  aiAnalysis: {
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative']
    },
    sentimentScore: Number,
    topics: [String],
    isFake: {
      type: Boolean,
      default: false
    },
    confidenceScore: Number
  },
  
  // Moderation
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  moderatedAt: Date,
  moderationReason: String,
  
  // Visibility
  isVisible: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  
  metadata: Schema.Types.Mixed
}, {
  timestamps: true
});

reviewSchema.index({ product: 1, rating: -1, createdAt: -1 });
reviewSchema.index({ product: 1, isVerifiedPurchase: 1, isVisible: 1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ 'aiAnalysis.sentiment': 1 });
reviewSchema.index({ helpfulCount: -1 });

// =====================================================
// 2. CART & WISHLIST SCHEMAS
// =====================================================

/**
 * Cart Schema
 * Ephemeral user state with sync capabilities
 */
const cartSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  items: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variant: {
      type: Schema.Types.ObjectId,
      required: true
    },
    sku: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    price: {
      type: Number,
      required: true
    },
    mrp: Number,
    discount: Number,
    
    // Product snapshot at time of adding
    productSnapshot: {
      title: String,
      image: String,
      attributes: Schema.Types.Mixed
    },
    
    // Customization
    customization: Schema.Types.Mixed,
    
    // Save for later
    saveForLater: {
      type: Boolean,
      default: false
    },
    savedForLaterAt: Date,
    
    addedAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Pricing summary
  pricing: {
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // Applied offers
  appliedCoupons: [{
    code: String,
    discount: Number,
    appliedAt: Date
  }],
  
  // Sync metadata
  lastSyncedAt: Date,
  deviceId: String,
  sessionId: String,
  
  // Abandonment tracking
  abandonedAt: Date,
  recoveryEmailSent: {
    type: Boolean,
    default: false
  },
  recoveryEmailSentAt: Date
}, {
  timestamps: true
});

cartSchema.index({ user: 1 });
cartSchema.index({ 'items.product': 1 });
cartSchema.index({ abandonedAt: 1, recoveryEmailSent: 1 });

// Pre-save to calculate totals
cartSchema.pre('save', function(next) {
  let subtotal = 0;
  let discount = 0;
  
  this.items.forEach(item => {
    if (!item.saveForLater) {
      subtotal += item.price * item.quantity;
      discount += (item.discount || 0) * item.quantity;
    }
  });
  
  this.pricing.subtotal = subtotal;
  this.pricing.discount = discount;
  // Tax and shipping calculated at checkout
  this.pricing.total = subtotal - discount;
  
  next();
});

/**
 * Wishlist Schema
 */
const wishlistSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  items: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variant: Schema.Types.ObjectId,
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium'
    },
    notes: String,
    addedAt: {
      type: Date,
      default: Date.now
    },
    
    // Price tracking
    targetPrice: Number,
    priceAlertEnabled: {
      type: Boolean,
      default: false
    },
    lastPriceCheck: Date,
    
    // Stock tracking
    stockAlertEnabled: {
      type: Boolean,
      default: false
    }
  }],
  
  // Sharing
  isPublic: {
    type: Boolean,
    default: false
  },
  shareToken: String,
  sharedWith: [String], // emails
  
  metadata: Schema.Types.Mixed
}, {
  timestamps: true
});

wishlistSchema.index({ user: 1 });
wishlistSchema.index({ 'items.product': 1 });
wishlistSchema.index({ shareToken: 1 });

// =====================================================
// 3. LOGS & ANALYTICS SCHEMAS
// =====================================================

/**
 * Search Analytics Schema
 */
const searchAnalyticsSchema = new Schema({
  sessionId: String,
  userId: Schema.Types.ObjectId,
  
  query: {
    type: String,
    required: true,
    trim: true
  },
  
  correctedQuery: String,
  originalQuery: String,
  
  filters: {
    categories: [String],
    brands: [String],
    priceRange: {
      min: Number,
      max: Number
    },
    colors: [String],
    sizes: [String],
    ratings: Number,
    custom: Schema.Types.Mixed
  },
  
  sorting: {
    field: String,
    order: String
  },
  
  pagination: {
    page: Number,
    pageSize: Number
  },
  
  results: {
    total: Number,
    returned: Number,
    zeroResults: Boolean
  },
  
  clickedProducts: [{
    productId: Schema.Types.ObjectId,
    position: Number,
    timestamp: Date
  }],
  
  convertedProduct: Schema.Types.ObjectId,
  
  device: {
    type: String,
    userAgent: String,
    os: String,
    browser: String
  },
  
  location: {
    country: String,
    region: String,
    city: String
  },
  
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

searchAnalyticsSchema.index({ query: 1, timestamp: -1 });
searchAnalyticsSchema.index({ userId: 1, timestamp: -1 });
searchAnalyticsSchema.index({ 'results.zeroResults': 1, timestamp: -1 });
searchAnalyticsSchema.index({ timestamp: -1 });

/**
 * Error Logs Schema
 */
const errorLogSchema = new Schema({
  errorType: {
    type: String,
    required: true
  },
  errorMessage: {
    type: String,
    required: true
  },
  stackTrace: String,
  
  service: {
    type: String,
    required: true
  },
  endpoint: String,
  method: String,
  
  user: {
    id: Schema.Types.ObjectId,
    email: String,
    role: String
  },
  
  request: {
    headers: Schema.Types.Mixed,
    body: Schema.Types.Mixed,
    query: Schema.Types.Mixed,
    params: Schema.Types.Mixed
  },
  
  environment: {
    nodeEnv: String,
    hostname: String,
    pid: Number,
    memoryUsage: Object
  },
  
  severity: {
    type: String,
    enum: ['debug', 'info', 'warning', 'error', 'critical'],
    default: 'error'
  },
  
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: Date,
  resolvedBy: Schema.Types.ObjectId,
  resolution: String,
  
  metadata: Schema.Types.Mixed
}, {
  timestamps: true
});

errorLogSchema.index({ errorType: 1, timestamp: -1 });
errorLogSchema.index({ service: 1, timestamp: -1 });
errorLogSchema.index({ severity: 1, isResolved: 1 });
errorLogSchema.index({ timestamp: -1 });

/**
 * Webhook Events Schema
 */
const webhookEventSchema = new Schema({
  eventType: {
    type: String,
    required: true
  },
  source: {
    type: String,
    required: true
  },
  
  payload: Schema.Types.Mixed,
  
  deliveryAttempts: [{
    attemptNumber: Number,
    timestamp: Date,
    statusCode: Number,
    response: String,
    success: Boolean
  }],
  
  status: {
    type: String,
    enum: ['pending', 'delivered', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  targetUrl: String,
  secret: String,
  
  nextRetryAt: Date,
  maxRetries: {
    type: Number,
    default: 5
  }
}, {
  timestamps: true
});

webhookEventSchema.index({ eventType: 1, status: 1 });
webhookEventSchema.index({ status: 1, nextRetryAt: 1 });

// =====================================================
// MODEL EXPORTS
// =====================================================

const models = {
  Category: mongoose.model('Category', categorySchema),
  Brand: mongoose.model('Brand', brandSchema),
  SizeChart: mongoose.model('SizeChart', sizeChartSchema),
  Product: mongoose.model('Product', productSchema),
  Review: mongoose.model('Review', reviewSchema),
  Cart: mongoose.model('Cart', cartSchema),
  Wishlist: mongoose.model('Wishlist', wishlistSchema),
  SearchAnalytics: mongoose.model('SearchAnalytics', searchAnalyticsSchema),
  ErrorLog: mongoose.model('ErrorLog', errorLogSchema),
  WebhookEvent: mongoose.model('WebhookEvent', webhookEventSchema)
};

module.exports = models;
