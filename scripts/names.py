# 2025 raw name -> canonical name, and flags for Sanjay to confirm
AUTO = {  # spelling/case variants: merged
 'Abhishek sir':'Abhishek Sir','Ajay sir':'Ajay Sir','Aman sir':'Aman Sir','Kamal sir':'Kamal Sir',
 'Mukesh sir':'Mukesh Sir','Santosh sir':'Santosh Sir','Shilpa mam':'Shilpa Mam','Vikas sir':'Vikas Sir',
 'Chirag sir':'Chirag Sir','Manas sir':'Manas Sir','Lata Maam':'Lata Mam','Mukesh Sir':'Mukesh Sir',
 'Subhankar sir':'Shubhankar Sir','Subhankar Sir':'Shubhankar Sir','Ranjit sir':'Ranjeet Sir',
 'Khusboo Mam':'Khushboo Mam','Raaiya Mam':'Raiya Mam','Shrihari Sir':'Shri Hari Sir','Rajeev Sir':'Rajiv Sir',
 'Rajeshdulkar':'Rajesh Dulkar Sir','Jay Meghrajani':'Jay Meghrajani Sir','Chirag Mistry sir':'Chirag Mistry Sir',
 'Shahu sir':'Shahu Sir','Sandip sir':'Sandip Sir',
}
CONFIRM = {  # canonical -> note
 'Khushboo Mam':'Merged "Khusboo Mam" (Chembur Naka) + "Khushboo Mam" (Chembur Station), both 11th Sci Chemistry. Same person?',
 'Raiya Mam':'Merged "Raiya Mam" + "Raaiya Mam", both 8th SSC Social Studies. Same person?',
 'Ranjeet Sir':'Merged "Ranjeet Sir" + "Ranjit sir", both Science Maths. Same person?',
 'Shubhankar Sir':'Merged "Subhankar" + "Shubhankar", both Science 1 / Chemistry. Same person?',
 'Shri Hari Sir':'Merged "Shri Hari Sir" (Borivali) + "Shrihari Sir" (Mahavir Nagar), both Maths. Same person?',
 'Rajiv Sir':'Merged "Rajeev Sir" (Borivali) + "Rajiv Sir" (Mahavir Nagar), both Hindi. Same person?',
 'Rajesh Dulkar Sir':'Was typed "Rajeshdulkar" (BK, Chembur Station). Separate from Rajesh Sir (Physics).',
 'Jay Sir':'Is "Jay Sir" the same as Jay Dubal Sir or Jay Meghrajani Sir? Kept separate.',
 'Chirag Sir':'Is "Chirag Sir" the same as Chirag Mistry Sir? Kept separate.',
 'Pooja Mam':'Is "Pooja Mam" (Borivali) the same as Pooja Pandya Mam? Kept separate.',
 'Kinjal Mam':'Is "Kinjal Mam" (Mahavir Nagar Geography) the same as Kinjal Karia Mam (Borivali Geography)? Kept separate.',
 'Manisha Mam':'Three Manishas last year (Manisha Mam, Manisha Mogal Mam, Manisha Raval Mam). Who is "Manisha Mam"? Kept separate.',
 'Shweta Mam':'Is Shweta Sharma Mam (Economics, Chembur Naka) a different person from Shweta Mam? Kept separate.',
 'Lata Mam':'Lata Mam (Hindi) and Latha Mam (English, Ghatkopar) kept as two different people.',
 'Deepali Mam':'Appears as a teacher (English) AND as staff (Chembur Station). If two different people, rename one.',
 'Namita Mam':'Appears as a teacher (Maths) AND as staff (Chembur Station). If two different people, rename one.',
 'Vidhi Mam':'Appears as a teacher (English, Ghatkopar) AND as staff (Ghatkopar). If two different people, rename one.',
 'Vishal Sir':'Appears as a teacher (Chembur) AND as staff (Matunga). If two different people, rename one.',
 'Manas Sir':'Appears as a teacher AND as staff (Borivali). If two different people, rename one.',
 'Vidhisha Mam':'Appears as a teacher AND as staff. If two different people, rename one.',
}
SUBJ = {'Maths':'Math','Maths 1':'Math 1','Maths 2':'Math 2','Economic':'Economics','History Civics':'History & Civics'}
def canon(n): return AUTO.get(n,n)
