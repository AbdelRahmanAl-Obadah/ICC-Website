import { db } from './firebase-init.js';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
function ready() { if (!db) throw new Error('Firebase is not configured.'); }
const clean = d => Object.fromEntries(Object.entries(d).filter(([,v]) => v !== undefined));
const list = async (p,c=[]) => { ready(); const s=await getDocs(query(collection(db,p),...c)); return s.docs.map(x=>({id:x.id,...x.data()})); };
const create = async(p,d) => { ready(); return (await addDoc(collection(db,p),clean({...d,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}))).id; };
const update = async(p,id,d) => { ready(); await updateDoc(doc(db,p,id),clean({...d,updatedAt:serverTimestamp()})); };
const remove = async(p,id) => { ready(); await deleteDoc(doc(db,p,id)); };
export async function getMajors(all=true){return list('majors',all?[orderBy('displayOrder')]:[where('active','==',true),orderBy('displayOrder')]);} export const fetchAllMajors=()=>getMajors(false);
export async function fetchMajorById(id){ready();const s=await getDoc(doc(db,'majors',id));return s.exists()&&s.data().active!==false?{id:s.id,...s.data()}:null;} export const createMajor=d=>create('majors',d);export const updateMajor=(id,d)=>update('majors',id,d);export const deleteMajor=id=>remove('majors',id);
export const getSemesters=majorId=>list('semesters',majorId?[where('majorId','==',majorId),orderBy('displayOrder')]:[orderBy('displayOrder')]);export const fetchSemestersForMajor=id=>getSemesters(id);export const createSemester=d=>create('semesters',d);export const updateSemester=(id,d)=>update('semesters',id,d);export const deleteSemester=id=>remove('semesters',id);
export const getSubjects=(f={})=>list('subjects',f.majorId?[where('majorId','==',f.majorId)]:[]);export const createSubject=d=>create('subjects',d);export const updateSubject=(id,d)=>update('subjects',id,d);export const deleteSubject=id=>remove('subjects',id);
export const getRequirements=category=>list('requirements',category?[where('category','==',category),orderBy('displayOrder')]:[orderBy('displayOrder')]);export const fetchRequirements=()=>getRequirements();export const createRequirement=d=>create('requirements',d);export const updateRequirement=(id,d)=>update('requirements',id,d);export const deleteRequirement=id=>remove('requirements',id);
export async function getSiteContent(){ready();const s=await getDoc(doc(db,'siteContent','public'));return s.exists()?s.data():{};}export const updateSiteContent=d=>update('siteContent','public',d);
export async function getSettings(){ready();const s=await getDoc(doc(db,'settings','public'));return s.exists()?s.data():{};}export const updateSettings=d=>update('settings','public',d);
