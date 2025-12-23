# Quick Start Guide - Auto-Start Chunks Feature

## 🚀 Getting Started (3 Steps)

### 1. Restart Backend
```bash
cd backend
# Stop current server (Ctrl+C)
python main.py
```

### 2. Refresh Frontend
- Reload your browser page
- Or restart dev server if needed

### 3. Test It!
- Click "Start" on a multiple-type campaign
- New modal opens with auto-start controls

## 📖 Quick Reference

### Single Campaign
```
Click "Start" → Old Modal → Confirm → Done
```

### Multiple Campaign - Auto Start
```
Click "Start" → New Modal → Set Gap (seconds) → "Auto Start All"
                                              
Auto Process:
┌─ Start Chunk 1
├─ Wait until "finished" (polls every 5s)
├─ Countdown: Gap seconds
├─ Start Chunk 2
├─ Wait until "finished"
├─ Countdown: Gap seconds
└─ Continue until all done...
```

### Multiple Campaign - Manual Start
```
Click "Start" → New Modal → Click individual "Start" button on any chunk
```

## 🎯 Key Points

✅ **Sequential**: One chunk at a time  
✅ **Smart Waiting**: Polls status until "finished"  
✅ **Timed Gap**: Countdown AFTER chunk finishes  
✅ **Manual Override**: Individual start buttons  
✅ **Real-time Progress**: Visual indicators  
✅ **Error Handling**: Continue or stop on failure  

## ⚙️ Quick Settings

**Change Gap Time**: Input field in modal (seconds)  
**Default Gap**: 30 seconds  
**Poll Interval**: Every 5 seconds  

## 🐛 Quick Troubleshooting

**Chunks won't start?**
- ✓ Check CID exists (chunk upserted)
- ✓ Check phone/caller set
- ✓ Check browser console

**Status not updating?**
- ✓ Check network connection
- ✓ Check Millis.ai API status
- ✓ Check browser console

**Modal won't close?**
- ✓ Wait for auto-start to complete
- ✓ Or close browser tab

## 📁 Files Changed

**Backend**:
- `backend/service/chunk.py`
- `backend/router/chunk.py`
- `backend/schema/chunk.py`

**Frontend**:
- `frontend/components/CampaignManagement.tsx`

## 🎉 That's It!

Simple, powerful, automated. Enjoy! 🚀

For detailed docs, see:
- `AUTO_START_IMPLEMENTATION_SUMMARY.md`
- `AUTO_START_CHUNKS_FEATURE.md`

