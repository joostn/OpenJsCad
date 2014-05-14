#!/usr/bin/perl
# Script to convert a compound quad surface file into seperate surfaces
# which can be read in to gridpro
# Eelco van Vliet
#
use strict;
use strict;
use Getopt::Long;
use File::Basename;
use Pod::Usage;

my $verbose=0;
my $outfilebase;
GetOptions(
  "outfilebase=s"    => \$outfilebase,
  "verbose!"    => \$verbose
);

defined $ARGV[0] || die ("Filename not given.\nUsage: inganalyse.pl <filename.csv> <keyfile> ,.\n");

my $infile=$ARGV[0];
-e $infile || die ("File not found : $infile\n") ;
$outfilebase=&basename($infile) if !defined $outfilebase;
$outfilebase=~s/\..*$//;

open(IN,$infile);

my $surface=0;

while(<IN>)
{
	if(/#/)
	{
		close OUT if $surface>0;
		my $outfile=sprintf("%s_S%02d.quad",$outfilebase,$surface);
		print "writing to $outfile\n";
		$surface++;
		open(OUT,">$outfile");
		next;
	}
	print OUT $_;
}


