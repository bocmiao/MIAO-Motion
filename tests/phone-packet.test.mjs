import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePhonePacket } from '../src/phone-packet.mjs';
const official = readFileSync(new URL('./fixtures/ifacialmocap-official.txt',import.meta.url),'utf8');
test('official iFacialMocap packet retains lateral eye, smile and gaze channels',()=>{
  const packet = parsePhonePacket(official);
  assert.ok(packet);
  const channels = Object.fromEntries(packet.categories.map(x=>[x.categoryName,x.score]));
  assert.equal(channels.eyeBlinkLeft,0.07);assert.equal(channels.eyeBlinkRight,0.07);
  assert.equal(channels.mouthSmileLeft,0);assert.equal(channels.mouthSmileRight,0);
  assert.equal(channels.eyeLookDownLeft,0.17);assert.equal(channels.eyeLookInRight,0.06);
  assert.equal(channels.jawOpen,0.12);
  assert.ok(Math.abs(packet.head.length()-1)<1e-8);
});
test('invalid/truncated head or oversized packet does not produce a pose',()=>{
  assert.equal(parsePhonePacket('jawOpen-40|=head#,,|'),null);
  assert.equal(parsePhonePacket('a'.repeat(8193)),null);
  assert.equal(parsePhonePacket('eyeBlink_L-20|=head#NaN,0,0|'),null);
});
test('one-sided phone channels stay one-sided (eyeBlink_L only closes the source-left eye)',()=>{
  const packet = parsePhonePacket(official.replace(/eyeBlink_L-\d+/,'eyeBlink_L-90').replace(/eyeBlink_R-\d+/,'eyeBlink_R-0'));
  const channels = Object.fromEntries(packet.categories.map(x=>[x.categoryName,x.score]));
  assert.equal(channels.eyeBlinkLeft,0.9);assert.equal(channels.eyeBlinkRight,0);
});
test('a packet without a head field keeps its expressions and reports head=null',()=>{
  const withoutHead = official.replace(/=head#[^|]*\|?/,'');
  assert.doesNotMatch(withoutHead,/=head#/);
  const packet = parsePhonePacket(withoutHead);
  assert.ok(packet);
  assert.equal(packet.head,null);
  const channels = Object.fromEntries(packet.categories.map(x=>[x.categoryName,x.score]));
  assert.equal(channels.jawOpen,0.12);assert.equal(channels.eyeLookDownLeft,0.17);
  assert.equal(parsePhonePacket('=head#1,2,3,0,0,0|'),null,'a head without any expression is not a face packet');
});
