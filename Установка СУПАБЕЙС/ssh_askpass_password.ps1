Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'SSH password'
$form.Width = 420
$form.Height = 150
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = 'Enter root password for 155.212.135.186'
$label.AutoSize = $true
$label.Left = 14
$label.Top = 15
$form.Controls.Add($label)

$box = New-Object System.Windows.Forms.TextBox
$box.Left = 14
$box.Top = 42
$box.Width = 375
$box.UseSystemPasswordChar = $true
$form.Controls.Add($box)

$ok = New-Object System.Windows.Forms.Button
$ok.Text = 'OK'
$ok.Left = 233
$ok.Top = 76
$ok.Width = 75
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($ok)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'Cancel'
$cancel.Left = 314
$cancel.Top = 76
$cancel.Width = 75
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancel)

$form.AcceptButton = $ok
$form.CancelButton = $cancel
$form.Add_Shown({ $box.Focus() })

if ($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.WriteLine($box.Text)
  exit 0
}

exit 1
