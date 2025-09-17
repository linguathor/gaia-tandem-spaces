# Zoom Webhook 401 Forbidden Error - Troubleshooting Report

## 🔍 **Problem Summary**
A Node.js Express webhook server for processing Zoom meeting transcripts consistently receives **401 Forbidden** errors when attempting to download transcript files, despite having valid authentication credentials.

## 📊 **Current Status**
- **Issue**: Persistent 401 Unauthorized errors on transcript downloads
- **Root Cause**: OAuth token contains marketplace scopes instead of required cloud recording scopes
- **Progress**: Extensive debugging implemented, exact problem identified
- **Next Steps**: Zoom app configuration verification needed

---

## 🏗️ **System Architecture**

### **Application Stack**
- **Platform**: Node.js v22.15.1 
- **Framework**: Express.js
- **Deployment**: Vercel (serverless)
- **Repository**: https://github.com/linguathor/gaia-tandem-spaces
- **Environment**: Production

### **Integration Flow**
1. Zoom meeting with recording/transcript enabled
2. Zoom sends webhook to: `https://[vercel-app].vercel.app/webhook`
3. Server processes `recording.transcript_completed` event
4. Downloads VTT transcript file using OAuth token + passcode
5. Generates AI feedback via OpenAI API
6. Sends feedback to participants

---

## 🔑 **Authentication Configuration**

### **Current Credentials** (Verified Working)
```bash
ZOOM_CLIENT_ID=p4iq9WLpSqmLZBfPwTyKlg
ZOOM_CLIENT_SECRET=x5LMz8FKdSTmW5AlltREXwIGi1Fv2wuV
ZOOM_WEBHOOK_SECRET_TOKEN=-VoMN-akQ7Ks2AJF_vXzsg
```

### **OAuth Implementation** (Verified Correct)
- **Grant Type**: `client_credentials` (Server-to-Server OAuth)
- **Endpoint**: `https://zoom.us/oauth/token`
- **Method**: POST with `application/x-www-form-urlencoded`
- **Authentication**: Basic Auth with Base64 encoded credentials

---

## 🐛 **Problem Analysis**

### **Expected Behavior**
OAuth token should contain cloud recording scopes:
```
cloud_recording:read:recording:admin
cloud_recording:read:meeting_transcript:admin
report:read:cloud_recording:admin
```

### **Actual Behavior** (From Debug Logs)
OAuth token only contains marketplace scopes:
```
marketplace:delete:event_subscription
marketplace:read:list_event_subscriptions
marketplace:update:client_secret
marketplace:update:event_subscription
marketplace:write:event_subscription
marketplace:write:websocket_connection
```

### **Debug Evidence**
Latest comprehensive debug output shows:
- ✅ **Credentials**: Valid Client ID/Secret being used
- ✅ **OAuth Request**: Properly formatted and successful (200 OK)
- ✅ **Token Generation**: Valid Bearer token received
- ❌ **Scopes**: Wrong scopes returned (marketplace vs cloud_recording)
- ❌ **Download Request**: 401 Forbidden due to insufficient permissions

---

## 📋 **Zoom App Configuration Requirements**

### **Required Scopes** (Must be enabled in Zoom Marketplace)
**Essential:**
- `cloud_recording:read:recording:admin` - View a recording
- `cloud_recording:read:meeting_transcript:admin` - Read meeting transcript

**Recommended:**
- `cloud_recording:read:list_recording_files:admin` - List recording files
- `report:read:cloud_recording:admin` - View recording reports

### **Current App Status**
- **App Name**: GAIA Tandem Spaces Feedback Assistant
- **App Type**: Server-to-Server OAuth
- **Client ID**: p4iq9WLpSqmLZBfPwTyKlg
- **Issue**: App appears to only have marketplace scopes enabled

---

## 🔧 **Technical Implementation Details**

### **Download URL Construction** (Working Correctly)
```javascript
// Combines passcode + access token
const finalUrl = `${downloadUrl}?pwd=${passcode}&access_token=${accessToken}`;
```

### **Error Response Pattern**
```json
{
  "status": false,
  "errorCode": 300,
  "errorMessage": "Forbidden"
}
```

### **Webhook Payload Structure** (Valid)
- Event: `recording.transcript_completed`
- Contains: `recording_play_passcode` (98 chars)
- Contains: Download URL for VTT transcript file
- File type: `TRANSCRIPT` with `.VTT` extension

---

## 🧪 **Debugging Capabilities**

### **Current Debug Features**
- ✅ Complete OAuth request/response logging
- ✅ Token scope analysis and breakdown
- ✅ URL construction step-by-step tracking
- ✅ HTTP error details with full headers
- ✅ Environment variable validation
- ✅ Comprehensive error categorization

### **Debug Output Sample**
```
=== SCOPE ANALYSIS ===
Scope contains "cloud_recording": false
Scope contains "marketplace": true
Individual scopes: ['marketplace:delete:event_subscription', ...]
Number of scopes: 6
```

---

## 📝 **Attempted Solutions**

### **Authentication Approaches Tried**
1. ❌ Authorization header with Bearer token
2. ❌ Query parameter with access_token only
3. ❌ Passcode parameter only
4. ❌ Invalid `account_credentials` grant type
5. ✅ Current: Combined passcode + access_token (correct approach)

### **Scope Configuration Attempts**
1. ❌ Legacy `recording:read` scope
2. ❌ Modern cloud recording scopes (not reflected in token)
3. ❌ Mixed scope combinations

### **URL Construction Variations**
1. ✅ Robust parameter handling (? vs &)
2. ✅ URL encoding of special characters
3. ✅ Proper passcode parameter naming (`pwd`)

---

## 🎯 **Next Action Required**

### **Primary Issue**
The Zoom app with Client ID `p4iq9WLpSqmLZBfPwTyKlg` **does not have cloud recording scopes enabled** despite user belief that they are configured.

### **Verification Steps Needed**
1. **Confirm App Identity**: Verify the app being configured matches Client ID `p4iq9WLpSqmLZBfPwTyKlg`
2. **Check Scope Status**: Ensure cloud recording scopes are actually enabled (not just visible)
3. **Publish Changes**: Confirm scope changes are saved and published
4. **Account Permissions**: Verify Zoom account has permissions for these scopes

### **Alternative Scenarios**
- **Multiple Apps**: User may have multiple Zoom apps and is configuring the wrong one
- **Scope Propagation**: Changes may not have propagated through Zoom's systems
- **Account Limitations**: Zoom account type may not support cloud recording scopes

---

## 📂 **Relevant Files**

### **Main Application**
- `index.js` - Express server with webhook handling and OAuth implementation
- `.env` - Environment variables (credentials verified)
- `package.json` - Dependencies and configuration

### **Key Functions**
- `getZoomAccessToken()` - OAuth token retrieval with comprehensive debugging
- `handleTranscriptCompleted()` - Transcript download and processing
- Webhook verification and signature validation

---

## 🔗 **External Dependencies**

### **Zoom APIs Used**
- OAuth: `https://zoom.us/oauth/token`
- Download: `https://us06web.zoom.us/rec/webhook_download/[path]`

### **Third-party Services**
- OpenAI API (working correctly)
- Vercel deployment platform

---

## 💡 **Recommended Next Steps**

1. **Immediate**: Verify Zoom app scopes configuration for Client ID `p4iq9WLpSqmLZBfPwTyKlg`
2. **If scopes are configured**: Check for multiple apps or propagation delay
3. **If scopes missing**: Enable required cloud recording scopes and publish
4. **Test**: Run another meeting to verify scope changes take effect
5. **Monitor**: Use existing debug output to confirm correct scopes are received

**Expected Resolution**: Once correct scopes are enabled, OAuth token should contain cloud recording permissions, resolving the 401 Forbidden error.