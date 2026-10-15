import importlib.util, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('cleanup',Path(__file__).with_name('storage-maintenance.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class Safety(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.old=c.RELEASES;c.RELEASES=self.base/'releases';c.RELEASES.mkdir();self.root=c.RELEASES/'retired';self.root.mkdir();(self.root/'pnpm-lock.yaml').write_text('locked');(self.root/'package.json').write_text('{}');self.path=self.root/'node_modules';self.path.mkdir();st=self.path.stat();self.row={'release':str(self.root),'relative':'node_modules','path':str(self.path),'device':st.st_dev,'inode':st.st_ino}
 def tearDown(self):c.RELEASES=self.old;self.tmp.cleanup()
 def test_explicit_snapshot_process_arguments_and_open_files_are_protected(self):
  from unittest.mock import patch
  import json
  realPath=Path; proc=self.base/'proc';item=proc/'123';(item/'fd').mkdir(parents=True)
  (item/'cwd').symlink_to(self.base,target_is_directory=True)
  snapshot=Path('/home/galaxy_os/.runtime/e05-mcp-20261013/candidate-source-r5')
  module=snapshot/'apps/api/dist/main.js';opened=snapshot/'node_modules/file.js'
  (item/'cmdline').write_bytes(b'/usr/bin/node\0'+str(module).encode()+b'\0')
  (item/'fd'/'3').symlink_to(opened)
  runtime=self.base/'runtime.json';runtime.write_text(json.dumps({'services':{}}))
  with patch.object(c,'RUNTIME',runtime),patch.object(c,'Path',side_effect=lambda p:proc if p=='/proc' else realPath(p)):
   used=c.active_paths()
  self.assertIn(module,used);self.assertIn(opened,used)
 def test_generated_target_and_replay(self):
  self.assertTrue(c.verify(self.row,set(),[]));self.path.rmdir();self.assertFalse(c.verify(self.row,set(),[]))
 def test_active_or_pinned_releases_are_rejected(self):
  for pins,active in [({self.root},[]),(set(),[self.path/'next'])]:
   with self.assertRaisesRegex(RuntimeError,'IN_USE'):c.verify(self.row,pins,active)
 def test_business_path_and_symlink_are_rejected(self):
  with self.assertRaisesRegex(RuntimeError,'CATEGORY'):c.verify({**self.row,'relative':'uploads'},set(),[])
  self.path.rmdir();self.path.symlink_to(self.base,target_is_directory=True)
  with self.assertRaisesRegex(RuntimeError,'SYMLINK'):c.verify(self.row,set(),[])
 def test_changed_inode_or_missing_restore_source_is_rejected(self):
  with self.assertRaisesRegex(RuntimeError,'CHANGED'):c.verify({**self.row,'inode':-1},set(),[])
  (self.root/'pnpm-lock.yaml').unlink()
  with self.assertRaisesRegex(RuntimeError,'SOURCE'):c.verify(self.row,set(),[])
if __name__=='__main__':unittest.main()
