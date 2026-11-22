# Reddit posts for real-person feedback

Written in the voice of your replies on the e-bike thread ("Guys I wld fr appreciate any feedback at all the deadline is in like 2-3 days", "Oh shoot, you're right I've been testing it mainly on laptops"). Reddit blocks the browsers I can use, so I could not open your original e-bike post to copy its exact emoji use. If it used more or different emojis, paste it to me and I will match it.

Before posting:
- Check each subreddit's rules in the sidebar. Some medical and caregiver subs ban self promotion or links. If a sub says no links, post the text and offer the link in the comments only if asked.
- Post from the same account as the e-bike post.
- Ask people not to paste their real medicine lists in the comments. The app keeps the list in their browser.
- Anything people tell you counts as real feedback, not as your preregistered user test. Keep the two apart in the write-up.

---

## 1. r/SideProject (most lenient, start here)

**Title:** I made a site that reads all your medicine labels together and tells you when 2 of them are secretly the same drug 💊

Hey guys, so I'm a high school senior and I've been building this for a hackathon called EvoHacks, the deadline is literally in like 10 hours lol

The idea came from Tylenol and NyQuil. Both have acetaminophen in them, and neither box tells you the other one does. Taken at the max each label allows thats 5,600 mg a day, and the Tylenol label itself warns about going over 4,000.

So Shelf Check takes everything in your medicine cabinet (prescriptions, over the counter stuff, supplements) and checks the official FDA labels against each other. Every warning quotes the actual line from the label so you can show it to a pharmacist.

https://shelf-check-nu.vercel.app

Would fr appreciate if you could:
- hit "see an example cabinet" and tell me if you get what its saying in like 10 seconds
- add a medicine you or your family actually has and tell me if anything confused you
- tell me if any warning looks wrong 🙏

It's free, no account, your list stays in your browser. It's not medical advice, it just shows you what the labels already say.

---

## 2. r/CaregiverSupport or r/AgingParents (the people it is built for, read the rules first)

**Title:** For anyone managing a parent's meds, I made a free tool that checks all their labels against each other, would love honest feedback

Hi everyone, I hope this is ok to post here, mods feel free to remove if not.

My family keeps track of a lot of medicines and the thing that scared me was how easy it is to double up without knowing. Like Tylenol and NyQuil both have acetaminophen and the boxes don't tell you about each other.

So I built Shelf Check for a student hackathon. You add what someone takes (prescriptions, store bought stuff, supplements) and it reads the official FDA labels together. It shows things like the same ingredient in 2 products, labels that warn about each other (like warfarin and St. John's Wort), and warnings for certain health conditions, and every warning quotes the exact label line so you can show the pharmacist.

https://shelf-check-nu.vercel.app

I'd really appreciate it if a few of you could try adding 2 or 3 medicines and tell me:
- was anything confusing
- did the "what to do" line on each warning make sense
- would you actually use this for your parent

Please don't post anyone's real medication list in the comments, the app keeps the list in your own browser and doesn't need an account. It's not medical advice, it always tells you to check with a pharmacist. Thank you guys 🙏

---

## 3. r/pharmacy or r/pharmacists (the harshest, most useful critics, check rules first since many pharmacy subs ban this)

**Title:** Student here, built a label-based med checker for a hackathon, would love pharmacists to tear it apart before I submit

Hey, I'm a high school senior and I built Shelf Check for a hackathon due today. I know pharmacists see the worst version of this problem so I'd fr value your take.

What it does: you add products by name, NDC or barcode, it matches each one to its FDA or DailyMed record, then plain code (no AI deciding anything) reads the labels together. It flags shared ingredients and daily totals against the label max, label interaction lines that name another product or its class (it uses the FDA's CYP and transporter tables for class matching), and patient-specific warnings like pregnancy, liver disease and allergies. Every flag quotes the label sentence. It never says anything is safe.

What I already know is weak: on a benchmark of 40 major pairs from DDInter it catches 10, because most labels describe risks by class or effect. I set the bars before testing and the full results are on the "how we tested" page.

https://shelf-check-nu.vercel.app

The things I'd most want from you:
- any warning that's wrong or misleading
- any "what to do" line you'd never want a patient to read
- what you'd want it to catch that it doesn't

Thanks so much, even one comment helps a ton 🙏

---

## 4. r/InternetIsBeautiful (wider audience, strict about polish)

**Title:** Shelf Check, a free site that reads the official labels of every medicine you own together and tells you when two of them overlap

(Body is usually not allowed there, the title and link do the work. Link: https://shelf-check-nu.vercel.app)

---

## Comment replies, in the same voice

- When someone finds a bug: "Oh shoot, you're right, thank you for catching that, fixing it now"
- When someone asks if it's AI: "the AI only helps read photos, the warnings come from plain code reading the FDA label text, and every warning quotes the label line"
- When someone says no warning means safe: "yeah thats exactly why it never says safe, a label can be silent about a real risk so it always says to check with a pharmacist"
- Near the deadline: "Guys I wld fr appreciate any feedback at all, the deadline is in like a few hours"
