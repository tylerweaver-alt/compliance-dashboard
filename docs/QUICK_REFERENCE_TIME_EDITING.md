# Quick Reference: Editing Call Times

## 🎯 Quick Start

### How to Edit a Call Time

1. **Click** on any time field in the call details table
   - Rcvd, Disp, Enrt, Stgd, OnScn, Dept, Arvd, or Avail
   - Look for the pencil icon (✎) on hover

2. **Enter** the new time value
   - Format: `MM/DD/YY HH:MM:SS`
   - Example: `10/31/25 21:45:51`

3. **Provide** a reason (required)
   - Explain why you're changing the time
   - Examples:
     - "Corrected data entry error"
     - "Updated based on CAD system correction"
     - "Adjusted per supervisor review"

4. **Save** the change
   - Click "Save Change" button
   - The table will refresh automatically
   - Check the Audit Log to see your edit

---

## 📋 Editable Time Fields

| Column | Full Name | What It Represents |
|--------|-----------|-------------------|
| **Rcvd** | Received | When the call was received |
| **Disp** | Dispatched | When the unit was dispatched |
| **Enrt** | Enroute | When the unit went enroute |
| **Stgd** | Staged | When the unit staged |
| **OnScn** | On Scene | When the unit arrived at scene |
| **Dept** | Departed | When the unit departed the scene |
| **Arvd** | Arrived | When the unit arrived at destination |
| **Avail** | Available | When the call was cleared/unit available |

---

## ✅ Best Practices

### Good Reasons for Editing:
- ✅ "Corrected data entry error - wrong time entered"
- ✅ "Updated based on CAD system correction"
- ✅ "Adjusted per supervisor review of incident"
- ✅ "Fixed timestamp based on radio logs"
- ✅ "Corrected to match actual dispatch time"

### Poor Reasons (avoid these):
- ❌ "Fixed" (too vague)
- ❌ "Error" (not specific enough)
- ❌ "Update" (doesn't explain why)
- ❌ "Changed" (obvious, but why?)

### Time Format:
- ✅ `10/31/25 21:45:51` (correct)
- ✅ `11/15/25 08:30:00` (correct)
- ❌ `10-31-2025 21:45:51` (wrong format)
- ❌ `21:45:51` (missing date)
- ❌ `10/31/25` (missing time)

---

## 🔍 Viewing Edit History

### In the Audit Log Panel:

1. Click the **"Audit Log"** tab at the top
2. Look for entries labeled **"Time Edit"**
3. Each entry shows:
   - Which field was changed
   - Old value → New value (color-coded)
   - Who made the change
   - When it was changed
   - Why it was changed

### Example Audit Log Entry:
```
Time Edit - Call #10312025-1977
Field: Received
Change: 10/31/25 21:45:51 → 10/31/25 21:46:00
Reason: Corrected data entry error
By: john.doe@example.com
When: 12/13/2025 10:30:45 AM
```

---

## ⚠️ Important Notes

### Security:
- 🔒 You must be **logged in** to edit times
- 🔒 All edits are **permanently logged**
- 🔒 Your name/email is **recorded** with each edit
- 🔒 Original values are **never deleted**

### Data Integrity:
- ✅ Changes are saved in a **database transaction**
- ✅ If something fails, **nothing is changed**
- ✅ Original call data is **preserved** in audit log
- ✅ You can always see **what was changed**

### Compliance:
- 📊 All edits are **auditable**
- 📊 Complete history is **maintained**
- 📊 Reasons are **required** for accountability
- 📊 No changes can be made **without explanation**

---

## 🚨 Troubleshooting

### "Please provide a reason for the time change"
- **Problem:** You didn't enter a reason
- **Solution:** Type an explanation in the "Reason" field

### "Failed to update time"
- **Problem:** Server error or invalid data
- **Solution:** Check the time format and try again

### Time field not clickable
- **Problem:** You might not be logged in
- **Solution:** Log in and try again

### Changes not showing
- **Problem:** Page didn't refresh
- **Solution:** Refresh the page manually (F5)

---

## 📞 Support

If you encounter issues:
1. Check this guide first
2. Verify you're logged in
3. Check the time format
4. Refresh the page
5. Contact your system administrator

---

## 🎓 Training Tips

### For New Users:
1. Start by viewing existing edits in the Audit Log
2. Practice on a test call first
3. Always provide clear, specific reasons
4. Double-check the time format before saving
5. Review your edit in the Audit Log after saving

### For Supervisors:
1. Review the Audit Log regularly
2. Check that reasons are specific and clear
3. Verify edits are legitimate corrections
4. Use the audit trail for compliance reporting
5. Train staff on proper editing procedures

---

## 📊 Common Use Cases

### Scenario 1: Data Entry Error
**Situation:** Dispatcher entered wrong "Enroute" time  
**Action:** Click Enrt → Enter correct time → Reason: "Corrected data entry error"  
**Result:** Time updated, change logged

### Scenario 2: CAD System Correction
**Situation:** CAD system had incorrect "On Scene" time  
**Action:** Click OnScn → Enter corrected time → Reason: "Updated based on CAD system correction"  
**Result:** Time updated, change logged

### Scenario 3: Supervisor Review
**Situation:** Multiple times need adjustment after review  
**Action:** Edit each field → Reason: "Adjusted per supervisor review"  
**Result:** All changes logged with same timestamp

---

## ✨ Summary

- ✅ Click any time field to edit
- ✅ Enter new time in MM/DD/YY HH:MM:SS format
- ✅ Provide a clear, specific reason
- ✅ Save and verify in Audit Log
- ✅ All changes are permanently logged
- ✅ Original data is never lost

**Remember:** Every edit is tracked and auditable. Always provide clear reasons for changes!

