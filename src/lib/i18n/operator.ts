export type OperatorLang = "en" | "hi" | "mr";

export const OPERATOR_LANGUAGES: { id: OperatorLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिंदी" },
  { id: "mr", label: "मराठी" },
];

export const OPERATOR_LANG_STORAGE_KEY = "operator-auth-lang";

type Dict = Record<string, string>;

const en: Dict = {
  "auth.title": "Operator Portal",
  "auth.tagline": "Excavator Manager",

  "login.title": "Operator Log In",
  "login.mobile": "Mobile Number",
  "login.pin": "PIN",
  "login.submitting": "Logging in...",
  "login.submit": "Log In",
  "login.firstTime": "First time here?",
  "login.setupAccount": "Set up your account",
  "login.owner": "Business owner?",
  "login.loginHere": "Log in here",
  "login.quickLoginAs": "Logging in as {mobile}",
  "login.notYou": "Not you? Use a different number",

  "signup.requestSent": "Request Sent",
  "signup.goToLogin": "Go to Log In",
  "signup.title": "Join Your Business",
  "signup.intro":
    "Enter the business code your admin gave you, your name and mobile number, and choose a PIN. Your admin will then approve your account before you can log in.",
  "signup.businessCode": "Business Code",
  "signup.businessCodePlaceholder": "e.g. Y56SFB",
  "signup.yourName": "Your Name",
  "signup.mobile": "Mobile Number",
  "signup.choosePin": "Choose a PIN",
  "signup.pinPlaceholder": "4-6 digits",
  "signup.confirmPin": "Confirm PIN",
  "signup.submitting": "Submitting...",
  "signup.submit": "Request to Join",
  "signup.alreadyApproved": "Already approved?",
  "signup.loginHere": "Log in here",

  "home.notAssigned": "You are not currently assigned to a machine. Check with your admin.",
  "home.currentHourMeter": "Current Hour Meter",
  "home.onJob": "On job: {customer} — {site}",
  "home.recentReadings": "Your Recent Readings",
  "home.noReadings": "No readings submitted yet.",
  "home.noJobRunning": "No job running right now — start one when you begin work.",
  "home.youStarted": "You started this job",
  "home.waitingApproval": "Waiting for your admin to approve",
  "home.sentBack": "Sent back for correction",
  "home.adminNote": "Admin note: {note}",
  "home.started": "Started",
  "home.startingReading": "Starting Reading",
  "home.ended": "Ended",
  "home.endingReading": "Ending Reading",
  "home.site": "Site",
  "home.attachment": "Attachment",
  "home.diesel": "Diesel",
  "home.note": "Note",
  "home.recentJobRequests": "Your Recent Job Requests",

  "status.approved": "Approved",
  "status.pending": "Pending",
  "status.rejected": "Rejected",
  "status.inProgress": "In Progress",
  "status.pendingApproval": "Pending Approval",

  "edit.trigger": "Edit",
  "edit.resubmit": "Resubmit Ending Reading",

  "startWork.trigger": "Start Work",
  "startWork.title": "Start Work",
  "startWork.startingHourMeter": "Starting Hour Meter",
  "startWork.site": "Site",
  "startWork.sitePlaceholder": "e.g. Wagholi",
  "startWork.siteHelpSet": "Set by your admin — only change this if it's actually different today.",
  "startWork.siteHelpUnset": "Not set by your admin yet — enter where this machine is.",
  "startWork.attachment": "Attachment / Tool Used (Optional)",
  "startWork.attachmentPlaceholder": "e.g. Bucket, Breaker",
  "tool.bucket": "Bucket",
  "tool.breaker": "Breaker",
  "tool.chaining": "Chaining",
  "startWork.dieselReceived": "Diesel Received (L)",
  "startWork.dieselDate": "Diesel Date",
  "startWork.note": "Note (Optional)",
  "startWork.notePlaceholder": "Anything your admin should know",
  "startWork.submitting": "Starting...",

  "endWork.trigger": "End Work",
  "endWork.title": "End Work",
  "endWork.endingHourMeter": "Ending Hour Meter",
  "endWork.help": "Your admin will review this reading and approve it before it's final.",
  "endWork.submitting": "Submitting...",
  "endWork.submit": "Submit for Approval",

  "editWork.title": "Correct Reading",
  "editWork.startingHourMeter": "Starting Hour Meter",
  "editWork.endingHourMeter": "Ending Hour Meter",
  "editWork.site": "Site",
  "editWork.attachment": "Attachment / Tool Used (Optional)",
  "editWork.dieselReceived": "Diesel Received (L)",
  "editWork.dieselDate": "Diesel Date",
  "editWork.note": "Note (Optional)",
  "editWork.submitting": "Saving...",
  "editWork.submit": "Save Correction",

  "submitReading.trigger": "Submit Today's Reading",
  "submitReading.title": "Submit Today's Reading",
  "submitReading.date": "Date",
  "submitReading.hourMeter": "Hour Meter",
  "submitReading.startStopTime": "Start / Stop Time",
  "submitReading.startMeter": "Start Meter",
  "submitReading.endMeter": "End Meter",
  "submitReading.startTime": "Start Time",
  "submitReading.stopTime": "Stop Time",
  "submitReading.breakMinutes": "Break (Minutes)",
  "submitReading.submitting": "Submitting...",
  "submitReading.submit": "Submit for Approval",
};

const hi: Dict = {
  "auth.title": "ऑपरेटर पोर्टल",
  "auth.tagline": "एक्सकेवेटर मैनेजर",

  "login.title": "ऑपरेटर लॉग इन",
  "login.mobile": "मोबाइल नंबर",
  "login.pin": "पिन",
  "login.submitting": "लॉग इन हो रहा है...",
  "login.submit": "लॉग इन करें",
  "login.firstTime": "पहली बार आए हैं?",
  "login.setupAccount": "अपना अकाउंट बनाएं",
  "login.owner": "बिज़नेस मालिक हैं?",
  "login.loginHere": "यहाँ लॉग इन करें",
  "login.quickLoginAs": "लॉग इन हो रहे हैं: {mobile}",
  "login.notYou": "यह आप नहीं हैं? दूसरा नंबर इस्तेमाल करें",

  "signup.requestSent": "अनुरोध भेज दिया गया",
  "signup.goToLogin": "लॉग इन पर जाएं",
  "signup.title": "अपने बिज़नेस से जुड़ें",
  "signup.intro":
    "अपने एडमिन का दिया हुआ बिज़नेस कोड, अपना नाम और मोबाइल नंबर डालें, और एक पिन चुनें। इसके बाद एडमिन आपके अकाउंट को मंज़ूरी देंगे, फिर आप लॉग इन कर पाएंगे।",
  "signup.businessCode": "बिज़नेस कोड",
  "signup.businessCodePlaceholder": "जैसे Y56SFB",
  "signup.yourName": "आपका नाम",
  "signup.mobile": "मोबाइल नंबर",
  "signup.choosePin": "पिन चुनें",
  "signup.pinPlaceholder": "4-6 अंक",
  "signup.confirmPin": "पिन दोबारा डालें",
  "signup.submitting": "भेजा जा रहा है...",
  "signup.submit": "जुड़ने का अनुरोध भेजें",
  "signup.alreadyApproved": "पहले से मंज़ूरी मिल चुकी है?",
  "signup.loginHere": "यहाँ लॉग इन करें",

  "home.notAssigned": "आपको अभी किसी मशीन पर नहीं लगाया गया है। अपने एडमिन से बात करें।",
  "home.currentHourMeter": "मौजूदा ऑवर मीटर",
  "home.onJob": "काम पर: {customer} — {site}",
  "home.recentReadings": "आपकी हाल की रीडिंग",
  "home.noReadings": "अभी तक कोई रीडिंग नहीं भेजी गई।",
  "home.noJobRunning": "अभी कोई काम शुरू नहीं है — काम शुरू करते समय शुरू करें।",
  "home.youStarted": "आपने यह काम शुरू किया",
  "home.waitingApproval": "एडमिन की मंज़ूरी का इंतज़ार है",
  "home.sentBack": "सुधार के लिए वापस भेजा गया",
  "home.adminNote": "एडमिन का नोट: {note}",
  "home.started": "शुरू हुआ",
  "home.startingReading": "शुरुआती रीडिंग",
  "home.ended": "खत्म हुआ",
  "home.endingReading": "आखिरी रीडिंग",
  "home.site": "साइट",
  "home.attachment": "अटैचमेंट",
  "home.diesel": "डीज़ल",
  "home.note": "नोट",
  "home.recentJobRequests": "आपके हाल के काम के अनुरोध",

  "status.approved": "मंज़ूर",
  "status.pending": "बाकी",
  "status.rejected": "अस्वीकृत",
  "status.inProgress": "चल रहा है",
  "status.pendingApproval": "मंज़ूरी बाकी",

  "edit.trigger": "बदलें",
  "edit.resubmit": "आखिरी रीडिंग दोबारा भेजें",

  "startWork.trigger": "काम शुरू करें",
  "startWork.title": "काम शुरू करें",
  "startWork.startingHourMeter": "शुरुआती ऑवर मीटर",
  "startWork.site": "साइट",
  "startWork.sitePlaceholder": "जैसे वाघोली",
  "startWork.siteHelpSet": "आपके एडमिन ने यह सेट किया है — अगर आज सच में अलग जगह है तभी बदलें।",
  "startWork.siteHelpUnset": "अभी एडमिन ने कोई साइट सेट नहीं की — यह मशीन कहाँ है वह लिखें।",
  "startWork.attachment": "अटैचमेंट / इस्तेमाल किया गया औज़ार (वैकल्पिक)",
  "startWork.attachmentPlaceholder": "जैसे बकेट, ब्रेकर",
  "tool.bucket": "बकेट",
  "tool.breaker": "ब्रेकर",
  "tool.chaining": "चेनिंग",
  "startWork.dieselReceived": "मिला हुआ डीज़ल (लीटर)",
  "startWork.dieselDate": "डीज़ल की तारीख",
  "startWork.note": "नोट (वैकल्पिक)",
  "startWork.notePlaceholder": "एडमिन को जो भी बताना हो",
  "startWork.submitting": "शुरू हो रहा है...",

  "endWork.trigger": "काम खत्म करें",
  "endWork.title": "काम खत्म करें",
  "endWork.endingHourMeter": "आखिरी ऑवर मीटर",
  "endWork.help": "एडमिन इस रीडिंग को देखकर मंज़ूर करेंगे, तभी यह पक्की मानी जाएगी।",
  "endWork.submitting": "भेजा जा रहा है...",
  "endWork.submit": "मंज़ूरी के लिए भेजें",

  "editWork.title": "रीडिंग ठीक करें",
  "editWork.startingHourMeter": "शुरुआती ऑवर मीटर",
  "editWork.endingHourMeter": "आखिरी ऑवर मीटर",
  "editWork.site": "साइट",
  "editWork.attachment": "अटैचमेंट / इस्तेमाल किया गया औज़ार (वैकल्पिक)",
  "editWork.dieselReceived": "मिला हुआ डीज़ल (लीटर)",
  "editWork.dieselDate": "डीज़ल की तारीख",
  "editWork.note": "नोट (वैकल्पिक)",
  "editWork.submitting": "सेव हो रहा है...",
  "editWork.submit": "सुधार सेव करें",

  "submitReading.trigger": "आज की रीडिंग भेजें",
  "submitReading.title": "आज की रीडिंग भेजें",
  "submitReading.date": "तारीख",
  "submitReading.hourMeter": "ऑवर मीटर",
  "submitReading.startStopTime": "शुरू / बंद का समय",
  "submitReading.startMeter": "शुरुआती मीटर",
  "submitReading.endMeter": "आखिरी मीटर",
  "submitReading.startTime": "शुरू होने का समय",
  "submitReading.stopTime": "बंद होने का समय",
  "submitReading.breakMinutes": "ब्रेक (मिनट)",
  "submitReading.submitting": "भेजा जा रहा है...",
  "submitReading.submit": "मंज़ूरी के लिए भेजें",
};

const mr: Dict = {
  "auth.title": "ऑपरेटर पोर्टल",
  "auth.tagline": "एक्स्कॅव्हेटर मॅनेजर",

  "login.title": "ऑपरेटर लॉग इन",
  "login.mobile": "मोबाईल नंबर",
  "login.pin": "पिन",
  "login.submitting": "लॉग इन होत आहे...",
  "login.submit": "लॉग इन करा",
  "login.firstTime": "पहिल्यांदाच आलात?",
  "login.setupAccount": "तुमचे खाते तयार करा",
  "login.owner": "व्यवसाय मालक आहात?",
  "login.loginHere": "इथे लॉग इन करा",
  "login.quickLoginAs": "लॉग इन करत आहात: {mobile}",
  "login.notYou": "हे तुम्ही नाही? वेगळा नंबर वापरा",

  "signup.requestSent": "विनंती पाठवली",
  "signup.goToLogin": "लॉग इनकडे जा",
  "signup.title": "तुमच्या व्यवसायात सामील व्हा",
  "signup.intro":
    "तुमच्या ऍडमिनने दिलेला बिझनेस कोड, तुमचे नाव आणि मोबाईल नंबर टाका, आणि एक पिन निवडा. त्यानंतर ऍडमिन तुमचे खाते मंजूर करतील, मगच तुम्ही लॉग इन करू शकाल.",
  "signup.businessCode": "बिझनेस कोड",
  "signup.businessCodePlaceholder": "उदा. Y56SFB",
  "signup.yourName": "तुमचे नाव",
  "signup.mobile": "मोबाईल नंबर",
  "signup.choosePin": "पिन निवडा",
  "signup.pinPlaceholder": "4-6 आकडे",
  "signup.confirmPin": "पिन पुन्हा टाका",
  "signup.submitting": "पाठवत आहे...",
  "signup.submit": "सामील होण्याची विनंती पाठवा",
  "signup.alreadyApproved": "आधीच मंजुरी मिळाली आहे?",
  "signup.loginHere": "इथे लॉग इन करा",

  "home.notAssigned": "तुम्हाला सध्या कोणतेही मशीन नेमलेले नाही. तुमच्या ऍडमिनशी बोला.",
  "home.currentHourMeter": "सध्याचे अवर मीटर",
  "home.onJob": "कामावर: {customer} — {site}",
  "home.recentReadings": "तुमच्या अलीकडील रीडिंग",
  "home.noReadings": "अजून कोणतीही रीडिंग पाठवलेली नाही.",
  "home.noJobRunning": "सध्या कोणतेही काम सुरू नाही — काम सुरू करताना सुरू करा.",
  "home.youStarted": "तुम्ही हे काम सुरू केले",
  "home.waitingApproval": "ऍडमिनच्या मंजुरीची वाट पाहत आहे",
  "home.sentBack": "दुरुस्तीसाठी परत पाठवले",
  "home.adminNote": "ऍडमिनची टीप: {note}",
  "home.started": "सुरू झाले",
  "home.startingReading": "सुरुवातीची रीडिंग",
  "home.ended": "संपले",
  "home.endingReading": "शेवटची रीडिंग",
  "home.site": "साईट",
  "home.attachment": "अटॅचमेंट",
  "home.diesel": "डिझेल",
  "home.note": "टीप",
  "home.recentJobRequests": "तुमच्या अलीकडील कामाच्या विनंत्या",

  "status.approved": "मंजूर",
  "status.pending": "प्रलंबित",
  "status.rejected": "नाकारले",
  "status.inProgress": "सुरू आहे",
  "status.pendingApproval": "मंजुरी प्रलंबित",

  "edit.trigger": "बदला",
  "edit.resubmit": "शेवटची रीडिंग पुन्हा पाठवा",

  "startWork.trigger": "काम सुरू करा",
  "startWork.title": "काम सुरू करा",
  "startWork.startingHourMeter": "सुरुवातीचे अवर मीटर",
  "startWork.site": "साईट",
  "startWork.sitePlaceholder": "उदा. वाघोली",
  "startWork.siteHelpSet": "तुमच्या ऍडमिनने हे सेट केले आहे — आज खरोखर वेगळी जागा असेल तरच बदला.",
  "startWork.siteHelpUnset": "ऍडमिनने अजून कोणतीही साईट सेट केलेली नाही — हे मशीन कुठे आहे ते लिहा.",
  "startWork.attachment": "अटॅचमेंट / वापरलेले साधन (ऐच्छिक)",
  "startWork.attachmentPlaceholder": "उदा. बकेट, ब्रेकर",
  "tool.bucket": "बकेट",
  "tool.breaker": "ब्रेकर",
  "tool.chaining": "चेनिंग",
  "startWork.dieselReceived": "मिळालेले डिझेल (लिटर)",
  "startWork.dieselDate": "डिझेलची तारीख",
  "startWork.note": "टीप (ऐच्छिक)",
  "startWork.notePlaceholder": "ऍडमिनला जे काही सांगायचे असेल ते",
  "startWork.submitting": "सुरू होत आहे...",

  "endWork.trigger": "काम संपवा",
  "endWork.title": "काम संपवा",
  "endWork.endingHourMeter": "शेवटचे अवर मीटर",
  "endWork.help": "ऍडमिन ही रीडिंग तपासून मंजूर करतील, तेव्हाच ती अंतिम मानली जाईल.",
  "endWork.submitting": "पाठवत आहे...",
  "endWork.submit": "मंजुरीसाठी पाठवा",

  "editWork.title": "रीडिंग दुरुस्त करा",
  "editWork.startingHourMeter": "सुरुवातीचे अवर मीटर",
  "editWork.endingHourMeter": "शेवटचे अवर मीटर",
  "editWork.site": "साईट",
  "editWork.attachment": "अटॅचमेंट / वापरलेले साधन (ऐच्छिक)",
  "editWork.dieselReceived": "मिळालेले डिझेल (लिटर)",
  "editWork.dieselDate": "डिझेलची तारीख",
  "editWork.note": "टीप (ऐच्छिक)",
  "editWork.submitting": "जतन होत आहे...",
  "editWork.submit": "दुरुस्ती जतन करा",

  "submitReading.trigger": "आजची रीडिंग पाठवा",
  "submitReading.title": "आजची रीडिंग पाठवा",
  "submitReading.date": "तारीख",
  "submitReading.hourMeter": "अवर मीटर",
  "submitReading.startStopTime": "सुरू / बंद वेळ",
  "submitReading.startMeter": "सुरुवातीचे मीटर",
  "submitReading.endMeter": "शेवटचे मीटर",
  "submitReading.startTime": "सुरू होण्याची वेळ",
  "submitReading.stopTime": "बंद होण्याची वेळ",
  "submitReading.breakMinutes": "ब्रेक (मिनिटे)",
  "submitReading.submitting": "पाठवत आहे...",
  "submitReading.submit": "मंजुरीसाठी पाठवा",
};

const dicts: Record<OperatorLang, Dict> = { en, hi, mr };

/** Translates a static UI string. Falls back to English, then to the raw
 * key, so a missing translation never crashes the page. `{var}` placeholders
 * in the matched string are replaced from `vars`. */
export function ot(lang: OperatorLang, key: string, vars?: Record<string, string | number>): string {
  let text = dicts[lang]?.[key] ?? dicts.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

// Server actions / Zod schemas generate their error text in plain English
// (translating those at the source would mean threading a lang param through
// every service function and schema). Instead this looks the exact English
// message up by string match at the point it's displayed, so the service
// layer stays untouched. Falls back to the original English text for any
// message not yet in this list.
const hiMessages: Dict = {
  "Wrong mobile number or PIN": "मोबाइल नंबर या पिन गलत है",
  "Enter a valid mobile number": "सही मोबाइल नंबर डालें",
  "Enter your PIN": "अपना पिन डालें",
  "Enter your business code": "अपना बिज़नेस कोड डालें",
  "Enter your name": "अपना नाम डालें",
  "PIN must be 4-6 digits": "पिन 4 से 6 अंकों का होना चाहिए",
  "PINs don't match": "दोनों पिन एक जैसे नहीं हैं",
  "Please check the form": "कृपया फॉर्म दोबारा जांचें",
  "Invalid business code — check with your admin.": "गलत बिज़नेस कोड — अपने एडमिन से जांच लें।",
  "This mobile number is already registered — log in instead.":
    "यह मोबाइल नंबर पहले से रजिस्टर है — इसके बजाय लॉग इन करें।",
  "You've already requested to join — ask your admin to approve your account.":
    "आपने पहले ही जुड़ने का अनुरोध भेजा है — अपने एडमिन से अकाउंट मंज़ूर करने को कहें।",
  "You are not assigned to a machine.": "आपको किसी मशीन पर नहीं लगाया गया है।",
  "Your admin has already started a job on this machine.": "आपके एडमिन ने इस मशीन पर पहले ही काम शुरू कर दिया है।",
  "Job request not found or already reviewed": "अनुरोध नहीं मिला या पहले ही देखा जा चुका है",
  "End hour meter must be greater than the starting hour meter":
    "आखिरी ऑवर मीटर शुरुआती ऑवर मीटर से ज़्यादा होना चाहिए",
  "End hour meter must be greater than start hour meter": "आखिरी ऑवर मीटर शुरुआती ऑवर मीटर से ज़्यादा होना चाहिए",
  "No active job found for your assigned machine": "आपकी मशीन पर कोई चालू काम नहीं मिला",
  "A reading for this date is already submitted": "इस तारीख की रीडिंग पहले ही भेजी जा चुकी है",
  "Working hours must be greater than 0 — check the times or readings":
    "काम के घंटे 0 से ज़्यादा होने चाहिए — समय या रीडिंग जांचें",
  "Enter either hour meter readings or start/stop time": "या तो ऑवर मीटर रीडिंग डालें या शुरू/बंद का समय",
  "Enter a valid reading": "सही रीडिंग डालें",
  "Enter a valid amount": "सही मात्रा डालें",
  "Request submitted! Ask your admin to approve your account, then log in below.":
    "अनुरोध भेज दिया गया! अपने एडमिन से अकाउंट मंज़ूर करने को कहें, फिर नीचे लॉग इन करें।",
  "Account activated — please log in below.": "अकाउंट चालू हो गया — कृपया नीचे लॉग इन करें।",
};

const mrMessages: Dict = {
  "Wrong mobile number or PIN": "मोबाईल नंबर किंवा पिन चुकीचा आहे",
  "Enter a valid mobile number": "योग्य मोबाईल नंबर टाका",
  "Enter your PIN": "तुमचा पिन टाका",
  "Enter your business code": "तुमचा बिझनेस कोड टाका",
  "Enter your name": "तुमचे नाव टाका",
  "PIN must be 4-6 digits": "पिन 4 ते 6 आकड्यांचा असावा",
  "PINs don't match": "दोन्ही पिन जुळत नाहीत",
  "Please check the form": "कृपया फॉर्म पुन्हा तपासा",
  "Invalid business code — check with your admin.": "चुकीचा बिझनेस कोड — तुमच्या ऍडमिनकडे तपासा.",
  "This mobile number is already registered — log in instead.":
    "हा मोबाईल नंबर आधीच नोंदणीकृत आहे — त्याऐवजी लॉग इन करा.",
  "You've already requested to join — ask your admin to approve your account.":
    "तुम्ही आधीच सामील होण्याची विनंती पाठवली आहे — तुमच्या ऍडमिनला खाते मंजूर करायला सांगा.",
  "You are not assigned to a machine.": "तुम्हाला कोणतेही मशीन नेमलेले नाही.",
  "Your admin has already started a job on this machine.": "तुमच्या ऍडमिनने या मशीनवर आधीच काम सुरू केले आहे.",
  "Job request not found or already reviewed": "विनंती सापडली नाही किंवा आधीच तपासली गेली आहे",
  "End hour meter must be greater than the starting hour meter":
    "शेवटचे अवर मीटर सुरुवातीच्या अवर मीटरपेक्षा जास्त असावे",
  "End hour meter must be greater than start hour meter": "शेवटचे अवर मीटर सुरुवातीच्या अवर मीटरपेक्षा जास्त असावे",
  "No active job found for your assigned machine": "तुमच्या मशीनवर कोणतेही सुरू काम सापडले नाही",
  "A reading for this date is already submitted": "या तारखेची रीडिंग आधीच पाठवली गेली आहे",
  "Working hours must be greater than 0 — check the times or readings":
    "कामाचे तास 0 पेक्षा जास्त असावेत — वेळा किंवा रीडिंग तपासा",
  "Enter either hour meter readings or start/stop time": "एकतर अवर मीटर रीडिंग टाका किंवा सुरू/बंद वेळ टाका",
  "Enter a valid reading": "योग्य रीडिंग टाका",
  "Enter a valid amount": "योग्य प्रमाण टाका",
  "Request submitted! Ask your admin to approve your account, then log in below.":
    "विनंती पाठवली! तुमच्या ऍडमिनला खाते मंजूर करायला सांगा, मग खाली लॉग इन करा.",
  "Account activated — please log in below.": "खाते सक्रिय झाले — कृपया खाली लॉग इन करा.",
};

const messageDicts: Record<Exclude<OperatorLang, "en">, Dict> = { hi: hiMessages, mr: mrMessages };

/** Translates a known English message returned from a server action
 * (Zod validation errors, service-layer errors) by exact string match.
 * Falls back to the original English text if this particular message
 * hasn't been added to the dictionary yet. */
export function otMsg(lang: OperatorLang, englishText: string): string {
  if (lang === "en") return englishText;
  return messageDicts[lang]?.[englishText] ?? englishText;
}
