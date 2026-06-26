# Clock Loader Implementation Guide

## Overview
All loading indicators in the system have been updated to use a beautiful **Clock Loader** animation, especially for sending final reports and certificates. This applies to **all user roles** (admin, manager, staff).

## What Changed

### 1. **New Dependencies**
- Installed `react-spinners` package for the ClockLoader component
- Created reusable `ClockLoaderComponent` in `/components/ClockLoader.tsx`

### 2. **Enhanced SweetAlert2 Loading Modals**
Updated `/utils/notify.ts` with:
- Custom CSS for clock-style loader animation
- `showLoadingModal(title, html)` - Show loading modal with clock loader
- `updateLoadingModal(html)` - Update loading modal content
- `closeLoadingModal()` - Close loading modal

### 3. **Updated Pages**

#### **Project Detail Page** (`/pages/projects/detail.tsx`)
- **Who**: Admin & Manager users
- **When**: Sending final project reports or certifications
- **Loading Message**: 
  - "Sending Certification..." (for certifications)
  - "Sending Report..." (for final reports)
  - "Preparing certificates and sending email. This may take a moment..."

#### **My Tasks Page** (`/pages/my-tasks.tsx`)
- **Who**: Staff users
- **When**: Sending task completion reports
- **Loading Message**:
  - "Sending Completion Report..."
  - "Preparing and sending report to client. This may take a moment..."

#### **Documents Page** (`/pages/documents.tsx`)
- **Who**: All users with document access
- **When**: Sending completion reports from documents page
- **Loading Message**:
  - "Sending Completion Report..."
  - "Preparing and sending report to client. This may take a moment..."

## Features

### 🎨 **Visual Design**
- **Color**: Navy blue (`#1e3a8a`) matching the app theme
- **Size**: 60px diameter
- **Animation**: Smooth rotating clock hand effect
- **Style**: Clean, modern, professional

### ⚡ **Performance**
- Lightweight CSS-based animation (no heavy GIFs)
- Automatically injects styles on first use
- Non-blocking UI - users can't dismiss during critical operations

### 🔒 **User Experience**
- **Cannot be dismissed** by clicking outside (prevents accidental cancellation)
- **No confirm button** - closes automatically when operation completes
- **Clear messaging** - users know exactly what's happening
- **Automatic success/error notifications** via global fetch wrapper

## How It Works

### For Developers

```typescript
import { showLoadingModal, closeLoadingModal, notifyError } from '@/utils/notify';

// Show loading modal
showLoadingModal(
    'Sending Report...',
    'Preparing and sending. This may take a moment...'
);

try {
    // Your async operation
    const result = await someLongOperation();
    
    // Close loading modal on success
    closeLoadingModal();
    // Success notification auto-shown via fetch wrapper
    
} catch (error) {
    // Close loading modal on error
    closeLoadingModal();
    notifyError('Operation failed.');
}
```

### Customization

The clock loader styles are defined in `/utils/notify.ts`:

```typescript
const injectClockLoaderStyles = () => {
  // Custom CSS for SweetAlert2 loader
  // Modify colors, sizes, animation speed here
};
```

**Key CSS Properties:**
- `border-color: #1e3a8a` - Clock color (navy blue)
- `width: 60px; height: 60px` - Loader size
- `animation: swal-rotate 1.2s` - Rotation speed (lower = faster)

## Testing

### Test Scenarios

1. **Admin/Manager - Project Certification**
   - Navigate to a completed project
   - Click "Send Certification"
   - Verify clock loader appears with message
   - Wait for completion
   - Verify success notification

2. **Staff - Task Completion Report**
   - Navigate to "My Tasks"
   - Complete a task and click "Send Report"
   - Verify clock loader appears
   - Wait for completion

3. **Documents Page**
   - Navigate to Documents
   - Send a completion report
   - Verify clock loader appears

### Expected Behavior

✅ Clock loader appears immediately when operation starts  
✅ Loader rotates smoothly (1.2s per rotation)  
✅ User cannot dismiss modal during operation  
✅ Modal closes automatically when operation completes  
✅ Success/error notification appears after modal closes  
✅ Works on all pages that send reports/certificates  

## Files Modified

1. `/package.json` - Added `react-spinners` dependency
2. `/components/ClockLoader.tsx` - New reusable component
3. `/utils/notify.ts` - Enhanced with clock loader functions
4. `/pages/projects/detail.tsx` - Updated for admin/manager
5. `/pages/my-tasks.tsx` - Updated for staff
6. `/pages/documents.tsx` - Updated for all users

## Benefits

✨ **Professional Look** - Modern clock animation vs basic spinner  
🎯 **Consistent UX** - Same loader across all report sending operations  
📱 **Responsive** - Works on all screen sizes  
♿ **Accessible** - Clear messaging for all users  
🚀 **Performant** - CSS-based animation, no external assets  
🔧 **Maintainable** - Centralized configuration in notify.ts  

## Future Enhancements

Potential improvements:
- Add progress percentage if backend sends progress updates
- Custom colors per operation type (reports vs certificates)
- Sound notification on completion (optional)
- Estimated time remaining display

---

**Last Updated**: 2026-04-11  
**Status**: ✅ Production Ready
